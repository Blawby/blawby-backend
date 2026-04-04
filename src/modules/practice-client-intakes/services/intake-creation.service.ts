import { randomUUID } from 'node:crypto';
import type { Stripe } from 'stripe';
import { fundManagement } from '@/engines/financial';
import { onboardingRepository } from '@/modules/onboarding/database/queries/onboarding.repository';
import { isAccountActive } from '@/modules/onboarding/services/connected-accounts.service';
import { upsertAddressTx } from '@/modules/practice/database/queries/address.repository';
import { organizationRepository } from '@/modules/practice/database/queries/organization.repository';
import { findPracticeDetailsByOrganization } from '@/modules/practice/database/queries/practice-details.repository';
import { practiceClientIntakesRepository } from '@/modules/practice-client-intakes/database/queries/practice-client-intakes.repository';
import type { InsertPracticeClientIntake } from '@/modules/practice-client-intakes/database/schema/practice-client-intakes.schema';
import { getActorAccessibleIntake } from '@/modules/practice-client-intakes/services/intake-access.helpers';
import { getLogger } from '@logtape/logtape';
import { createIntakePaymentLink } from '@/modules/practice-client-intakes/services/intake-stripe.helpers';
import type {
  CreateIntakeResponse,
  CreatePracticeClientIntakeRequest,
  IntakeSettingsResponse,
  UpdatePracticeClientIntakeRequest,
} from '@/modules/practice-client-intakes/types/practice-client-intakes.types';
import { db } from '@/shared/database';
import { IntakePaymentCreated, IntakeSubmitted } from '@/shared/events/definitions';
import type { Result } from '@/shared/types/result';
import type { ServiceContext } from '@/shared/types/service-context';
import { result } from '@/shared/utils/result';

const logger = getLogger(['practice-client-intakes', 'service']);

type IntakeCreationRequest = CreatePracticeClientIntakeRequest & {
  clientIp?: string;
  userAgent?: string;
  origin?: string | null;
};

const getIntakeSettings = async (params: {
  slug: string;
  organization?: NonNullable<Awaited<ReturnType<typeof organizationRepository.findBySlug>>>;
}): Promise<Result<IntakeSettingsResponse>> => {
  try {
    const organization = params.organization ?? (await organizationRepository.findBySlug(params.slug));

    if (!organization) {
      return result.notFound(`Organization with slug '${params.slug}' not found`);
    }

    if (!organization.activeSubscriptionId) {
      return result.forbidden('Organization does not have an active subscription');
    }

    const connectedAccount = await onboardingRepository.findByOrganizationId(organization.id);
    if (!connectedAccount) {
      return result.forbidden('Organization does not have a connected Stripe account');
    }

    if (!(await isAccountActive(connectedAccount))) {
      return result.forbidden('Connected account is not ready to accept payments');
    }

    const practiceDetails = await findPracticeDetailsByOrganization(organization.id);
    const consultationFee = practiceDetails?.consultation_fee ?? 0;

    return result.ok({
      success: true,
      data: {
        organization: {
          id: organization.id,
          name: organization.name,
          slug: organization.slug,
          logo: organization.logo ?? undefined,
        },
        settings: {
          payment_link_enabled: Boolean(organization.paymentLinkEnabled) && consultationFee > 0,
          // Keep FE display and create-intake amount consistent with the same backend source.
          consultation_fee: consultationFee,
        },
        connected_account: {
          id: connectedAccount.id,
          charges_enabled: connectedAccount.charges_enabled,
        },
      },
    });
  } catch (error) {
    logger.error('Failed to get organization intake settings for {slug}: {error}', {
      slug: params.slug,
      error,
    });
    return result.internalError('Failed to get organization intake settings');
  }
};

const insertIntakeRecordTx = async (
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  params: {
    request: IntakeCreationRequest;
    resolvedAmount: number;
    organizationId: string;
    intakeId: string;
    connectedAccountId?: string;
    stripePaymentLinkId: string | null;
    shouldBypassPayment: boolean;
    validatedUserId?: string;
  }
): Promise<Awaited<ReturnType<typeof practiceClientIntakesRepository.create>>> => {
  let addressId: string | undefined = undefined;
  if (params.request.address) {
    const addressRecord = await upsertAddressTx(tx, {
      addressData: params.request.address,
      organizationId: params.organizationId,
      userId: params.validatedUserId,
      type: 'client_intake',
    });
    addressId = addressRecord?.id;
  }

  const intakeData: InsertPracticeClientIntake = {
    id: params.intakeId,
    organization_id: params.organizationId,
    connected_account_id: params.connectedAccountId,
    stripe_payment_link_id: params.stripePaymentLinkId,
    address_id: addressId,
    conversation_id: params.request.conversation_id,
    amount: params.resolvedAmount,
    application_fee: fundManagement.calculateApplicationFee(params.resolvedAmount),
    currency: 'usd',
    status: params.shouldBypassPayment ? 'succeeded' : 'open',
    triage_status: 'pending_review',
    metadata: {
      email: params.request.email,
      name: params.request.name,
      phone: params.request.phone,
      on_behalf_of: params.request.on_behalf_of,
      opposing_party: params.request.opposing_party,
      description: params.request.description,
      address: params.request.address,
      ...(params.validatedUserId && { user_id: params.validatedUserId }),
    },
    client_ip: params.request.clientIp,
    user_agent: params.request.userAgent,
    urgency: params.request.urgency,
    desired_outcome: params.request.desired_outcome,
    court_date: params.request.court_date ? new Date(params.request.court_date) : undefined,
    has_documents: params.request.has_documents,
    income: params.request.income,
    household_size: params.request.household_size,
    case_strength: params.request.case_strength,
    ...(params.shouldBypassPayment && { succeeded_at: new Date() }),
  };

  return practiceClientIntakesRepository.create(intakeData, tx);
};

const createIntake = async (params: { data: IntakeCreationRequest }): Promise<Result<CreateIntakeResponse>> => {
  const { data: request } = params;

  try {
    const organization = await organizationRepository.findBySlug(request.slug);
    if (!organization) {
      return result.notFound(`Organization with slug '${request.slug}' not found`);
    }

    const practiceDetails = await findPracticeDetailsByOrganization(organization.id);
    const consultationFee = practiceDetails?.consultation_fee ?? 0;

    const requiresPayment = Boolean(organization.paymentLinkEnabled) && consultationFee > 0;
    // Backend is the source of truth for amount in create-intake flows.
    // UI/worker can read intake settings for display, but the charged amount must
    // Always come from backend practice configuration.
    const resolvedAmount = requiresPayment ? consultationFee : 0;
    const shouldBypassPayment = !requiresPayment;

    if (requiresPayment && resolvedAmount < 50) {
      return result.badRequest(
        `Invalid practice consultation fee configuration: resolved amount is ${resolvedAmount} cents, but minimum is 50 cents when payment is required.`
      );
    }

    let stripePaymentLink: Stripe.Response<Stripe.PaymentLink> | null = null;
    let connectedAccount: Awaited<ReturnType<typeof onboardingRepository.findByOrganizationId>> | null = null;
    const intakeId = randomUUID();
    const validatedUserId = request.user_id;

    if (!shouldBypassPayment) {
      // Validate intake settings (throws if invalid)
      const settingsResult = await getIntakeSettings({ slug: request.slug, organization });
      if (!settingsResult.success) {
        return settingsResult;
      }

      connectedAccount = await onboardingRepository.findByOrganizationId(organization.id);
      if (!connectedAccount) {
        return result.fail('Connected account not found');
      }

      stripePaymentLink = await createIntakePaymentLink({
        amount: resolvedAmount,
        email: request.email,
        name: request.name,
        phone: request.phone,
        on_behalf_of: request.on_behalf_of,
        opposing_party: request.opposing_party,
        description: request.description,
        organizationId: organization.id,
        organizationName: organization.name,
        organizationSlug: organization.slug,
        intakeId,
        stripeAccountId: connectedAccount.stripe_account_id,
        origin: request.origin,
        conversationId: request.conversation_id,
        address: request.address,
        userId: validatedUserId,
      });
    }

    const intake = await db.transaction(async (tx) =>
      insertIntakeRecordTx(tx, {
        request,
        resolvedAmount,
        organizationId: organization.id,
        intakeId,
        connectedAccountId: connectedAccount?.id,
        stripePaymentLinkId: stripePaymentLink?.id ?? null,
        shouldBypassPayment,
        validatedUserId,
      })
    );

    void IntakePaymentCreated.dispatch(
      {
        intake_payment_id: intake.id,
        uuid: intake.id,
        stripe_payment_link_id: stripePaymentLink?.id,
        amount: resolvedAmount,
        currency: 'usd',
        client_email: request.email,
        client_name: request.name,
        created_at: new Date(),
      },
      {
        actorId: 'organization',
        organizationId: organization.id,
      }
    );

    // For bypass-payment intakes (free or payment disabled), the intake is already complete
    if (shouldBypassPayment) {
      void IntakeSubmitted.dispatch(
        {
          intake_id: intake.id,
          organization_id: organization.id,
          organization_name: organization.name,
          billing_email: organization.billingEmail ?? null,
          client_email: request.email,
          client_name: request.name,
          amount: resolvedAmount,
          currency: 'usd',
        },
        {
          actorId: 'organization',
          organizationId: organization.id,
        }
      );
    }

    return result.ok({
      success: true,
      data: {
        uuid: intake.id,
        payment_link_url: stripePaymentLink?.url ?? null,
        amount: resolvedAmount,
        currency: 'usd',
        status: shouldBypassPayment ? 'succeeded' : 'open',
        organization: {
          name: organization.name,
          logo: organization.logo ?? undefined,
        },
        urgency: request.urgency,
        desired_outcome: request.desired_outcome,
        court_date: request.court_date ? new Date(request.court_date) : undefined,
        has_documents: request.has_documents,
        income: request.income,
        household_size: request.household_size,
        case_strength: request.case_strength,
      },
    });
  } catch (error) {
    logger.error('Failed to create practice client intake for {slug}: {error}', {
      slug: request.slug,
      error,
    });
    return result.internalError('Failed to create practice client intake');
  }
};

const updateIntake = async (
  params: { uuid: string; data: UpdatePracticeClientIntakeRequest },
  ctx: ServiceContext
): Promise<Result<{ success: boolean; message: string }>> => {
  try {
    const intakeResult = await getActorAccessibleIntake(params.uuid, ctx, 'update');
    if (!intakeResult.success) {
      return intakeResult;
    }

    const { amount, court_date, ...restUpdateData } = params.data;
    const dataToUpdate = {
      ...restUpdateData,
      ...(typeof amount !== 'undefined' && { amount }),
      ...(typeof court_date !== 'undefined' && { court_date: court_date ? new Date(court_date) : null }),
    };

    if (Object.keys(dataToUpdate).length === 0) {
      return result.badRequest('No fields to update provided.');
    }

    await practiceClientIntakesRepository.update(params.uuid, dataToUpdate);

    return result.ok({ success: true, message: 'Intake updated successfully.' });
  } catch (error) {
    logger.error('Failed to update practice client intake for {uuid}: {error}', {
      uuid: params.uuid,
      error,
    });
    return result.internalError('Failed to update practice client intake');
  }
};

export const intakeCreationService = {
  getIntakeSettings,
  createIntake,
  updateIntake,
};
