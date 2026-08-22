import { randomUUID } from 'node:crypto';
import { getLogger } from '@logtape/logtape';
import { HTTPException } from 'hono/http-exception';
import type { Stripe } from 'stripe';

import { fundManagement } from '@/engines/financial';
import { onboardingRepository } from '@/modules/onboarding/database/queries/onboarding.repository';
import { upsertAddress } from '@/modules/practice/database/queries/address.repository';
import { organizationRepository } from '@/modules/practice/database/queries/organization.repository';
import { findPracticeDetailsByOrganization } from '@/modules/practice/database/queries/practice-details.repository';
import type { Organization } from '@/modules/practice/types/organization.types';
import { practiceClientIntakesRepository } from '@/modules/practice-client-intakes/database/queries/practice-client-intakes.repository';
import type {
  InsertPracticeClientIntake,
  SelectPracticeClientIntake,
} from '@/modules/practice-client-intakes/database/schema/practice-client-intakes.schema';
import { getIntakeSettings } from '@/modules/practice-client-intakes/operations/get-intake-settings.operation';
import { createIntakePaymentLink } from '@/modules/practice-client-intakes/services/intake-stripe.helpers';
import type {
  CreateIntakeResponse,
  CreatePracticeClientIntakeRequest,
} from '@/modules/practice-client-intakes/types/practice-client-intakes.types';
import { uow } from '@/shared/database/uow';
import { IntakePaymentCreated, IntakeSubmitted } from '@/shared/events/definitions';
import { assertLegalOperationTenant, type LegalOperationContext } from '@/shared/types/legal-operation-context';
import { stripe } from '@/shared/utils/stripe-client';

const logger = getLogger(['practice-client-intakes', 'create-intake-operation']);

const MIN_PAYABLE_AMOUNT_CENTS = 50;

/** Client-submitted intake payload. `slug` and `user_id` are resolved by the caller (route/facade), not carried in-band. */
type CreateIntakeData = Omit<CreatePracticeClientIntakeRequest, 'slug' | 'user_id'> & {
  clientIp?: string;
  userAgent?: string;
  origin?: string | null;
};

const insertIntakeRecord = async (params: {
  data: CreateIntakeData;
  resolvedAmount: number;
  organizationId: string;
  intakeId: string;
  practiceServiceName?: string;
  connectedAccountId?: string;
  stripePaymentLinkId: string | null;
  shouldBypassPayment: boolean;
  actorUserId?: string;
  requestKey?: string;
}): Promise<SelectPracticeClientIntake> => {
  let addressId: string | undefined = undefined;
  if (params.data.address) {
    const addressRecord = await upsertAddress({
      addressData: params.data.address,
      organizationId: params.organizationId,
      userId: params.actorUserId,
      type: 'client_intake',
    });
    addressId = addressRecord?.id;
  }

  const intakeData: InsertPracticeClientIntake = {
    id: params.intakeId,
    organization_id: params.organizationId,
    connected_account_id: params.connectedAccountId,
    practice_service_id: params.data.practice_service_uuid,
    stripe_payment_link_id: params.stripePaymentLinkId,
    address_id: addressId,
    conversation_id: params.data.conversation_id,
    amount: params.resolvedAmount,
    application_fee: fundManagement.calculateApplicationFee(params.resolvedAmount),
    currency: 'usd',
    status: params.shouldBypassPayment ? 'succeeded' : 'open',
    triage_status: 'pending_review',
    metadata: {
      email: params.data.email,
      name: params.data.name,
      phone: params.data.phone,
      on_behalf_of: params.data.on_behalf_of,
      opposing_party: params.data.opposing_party,
      description: params.data.description,
      practice_service_name: params.practiceServiceName,
      practice_service_uuid: params.data.practice_service_uuid,
      address: params.data.address,
      custom_fields: params.data.custom_fields,
      ...(params.actorUserId && { user_id: params.actorUserId }),
    },
    client_ip: params.data.clientIp,
    user_agent: params.data.userAgent,
    urgency: params.data.urgency,
    desired_outcome: params.data.desired_outcome,
    court_date: params.data.court_date ? new Date(params.data.court_date) : undefined,
    has_documents: params.data.has_documents,
    income: params.data.income,
    household_size: params.data.household_size,
    case_strength: params.data.case_strength,
    ...(params.shouldBypassPayment && { succeeded_at: new Date() }),
  };

  return params.requestKey
    ? practiceClientIntakesRepository.createWithKrabiClawRequestKey({
        ...intakeData,
        krabiclaw_request_key: params.requestKey,
      })
    : practiceClientIntakesRepository.create(intakeData);
};

const toCreateIntakeResponse = (
  intake: SelectPracticeClientIntake,
  organization: Pick<Organization, 'name' | 'logo'>,
  paymentLinkUrl: string | null
): CreateIntakeResponse => ({
  uuid: intake.id,
  payment_link_url: paymentLinkUrl,
  amount: intake.amount,
  currency: intake.currency,
  status: intake.status,
  organization: {
    name: organization.name,
    logo: organization.logo ?? undefined,
  },
  urgency: intake.urgency ?? undefined,
  desired_outcome: intake.desired_outcome ?? undefined,
  court_date: intake.court_date ?? undefined,
  has_documents: intake.has_documents ?? undefined,
  income: intake.income ?? undefined,
  household_size: intake.household_size ?? undefined,
  case_strength: intake.case_strength ?? undefined,
});

/** Payment links are permanent Stripe objects; refetching the URL on recovery is safe and avoids storing it redundantly. */
const resolveExistingPaymentLinkUrl = async (paymentLinkId: string | null): Promise<string | null> => {
  if (!paymentLinkId) {
    return null;
  }
  try {
    const paymentLink = await stripe.paymentLinks.retrieve(paymentLinkId);
    return paymentLink.url;
  } catch (error) {
    logger.warn('Could not refetch payment link {paymentLinkId} for idempotent intake recovery', {
      paymentLinkId,
      error,
    });
    return null;
  }
};

/**
 * Create a practice client intake (with optional Stripe payment link) for an organization
 * already resolved by the caller. When `requestKey` is present (facade-originated requests),
 * a prior request under the same `(organizationId, requestKey)` is recovered without repeating
 * the Stripe call or inserting a duplicate row (R24, KTD21) — recovery is checked before any
 * Stripe I/O so a retry never creates a second payment link for the same submission.
 */
export const createIntake = async (
  { organizationId, data, requestKey }: { organizationId: string; data: CreateIntakeData; requestKey?: string },
  ctx: LegalOperationContext
): Promise<CreateIntakeResponse> => {
  assertLegalOperationTenant(ctx, organizationId);

  const organization = await organizationRepository.findById(organizationId);
  if (!organization) {
    throw new HTTPException(404, { message: `Organization not found for '${organizationId}'` });
  }

  try {
    if (requestKey) {
      const existing = await practiceClientIntakesRepository.findByKrabiClawRequestKey(organizationId, requestKey);
      if (existing) {
        const paymentLinkUrl = await resolveExistingPaymentLinkUrl(existing.stripe_payment_link_id);
        return toCreateIntakeResponse(existing, organization, paymentLinkUrl);
      }
    }

    const practiceDetails = await findPracticeDetailsByOrganization(organization.id);
    const consultationFee = practiceDetails?.consultation_fee ?? 0;

    if (
      data.practice_service_uuid &&
      !(practiceDetails?.services ?? []).some((service) => service.id === data.practice_service_uuid)
    ) {
      throw new HTTPException(400, { message: 'Selected practice service does not belong to this organization.' });
    }

    const requiresPayment = Boolean(organization.paymentLinkEnabled) && consultationFee > 0;
    const selectedPracticeServiceName = data.practice_service_uuid
      ? (practiceDetails?.services ?? []).find((service) => service.id === data.practice_service_uuid)?.name
      : undefined;
    // Backend is the source of truth for amount in create-intake flows; the resolved amount
    // Must always come from backend practice configuration, never a caller-supplied value.
    const resolvedAmount = requiresPayment ? consultationFee : 0;
    const shouldBypassPayment = !requiresPayment;

    if (requiresPayment && resolvedAmount < MIN_PAYABLE_AMOUNT_CENTS) {
      throw new HTTPException(400, {
        message: `Invalid practice consultation fee configuration: resolved amount is ${resolvedAmount} cents, but minimum is ${MIN_PAYABLE_AMOUNT_CENTS} cents when payment is required.`,
      });
    }

    let stripePaymentLink: Stripe.Response<Stripe.PaymentLink> | null = null;
    let connectedAccount: Awaited<ReturnType<typeof onboardingRepository.findByOrganizationId>> | null = null;
    const intakeId = randomUUID();

    if (!shouldBypassPayment) {
      await getIntakeSettings({ organizationId }, ctx);

      connectedAccount = await onboardingRepository.findByOrganizationId(organization.id);
      if (!connectedAccount) {
        throw new Error('Connected account not found');
      }

      stripePaymentLink = await createIntakePaymentLink({
        amount: resolvedAmount,
        email: data.email,
        name: data.name,
        phone: data.phone,
        on_behalf_of: data.on_behalf_of,
        opposing_party: data.opposing_party,
        description: data.description,
        organizationId: organization.id,
        organizationName: organization.name,
        organizationSlug: organization.slug,
        intakeId,
        stripeAccountId: connectedAccount.stripe_account_id,
        origin: data.origin,
        conversationId: data.conversation_id,
        address: data.address,
        userId: ctx.userId,
      });
    }

    const intake = await uow.transaction(async () =>
      insertIntakeRecord({
        data,
        resolvedAmount,
        organizationId: organization.id,
        intakeId,
        practiceServiceName: selectedPracticeServiceName,
        connectedAccountId: connectedAccount?.id,
        stripePaymentLinkId: stripePaymentLink?.id ?? null,
        shouldBypassPayment,
        actorUserId: ctx.userId ?? undefined,
        requestKey,
      })
    );

    void IntakePaymentCreated.dispatch(
      {
        intake_payment_id: intake.id,
        uuid: intake.id,
        stripe_payment_link_id: stripePaymentLink?.id,
        amount: resolvedAmount,
        currency: 'usd',
        client_email: data.email,
        client_name: data.name,
        created_at: new Date(),
      },
      {
        actorId: 'organization',
        organizationId: organization.id,
      }
    );

    if (shouldBypassPayment) {
      void IntakeSubmitted.dispatch(
        {
          intake_id: intake.id,
          organization_id: organization.id,
          organization_name: organization.name,
          organization_slug: organization.slug ?? undefined,
          billing_email: organization.billingEmail ?? null,
          client_email: data.email,
          client_name: data.name,
          amount: resolvedAmount,
          currency: 'usd',
          practice_service_name: selectedPracticeServiceName,
          jurisdiction: data.address?.state,
          court_date: data.court_date,
          has_documents: data.has_documents,
          case_strength: data.case_strength,
          desired_outcome: data.desired_outcome,
          opposing_party: data.opposing_party,
          description: data.description,
          submitted_at: new Date().toISOString(),
        },
        {
          actorId: 'organization',
          organizationId: organization.id,
        }
      );
    }

    return toCreateIntakeResponse(intake, organization, stripePaymentLink?.url ?? null);
  } catch (error) {
    logger.error('Failed to create practice client intake for organization {organizationId}: {error}', {
      organizationId,
      error,
    });
    throw error;
  }
};

export type { CreateIntakeData };
