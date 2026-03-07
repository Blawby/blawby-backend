import { randomUUID } from 'node:crypto';
import { getLogger } from '@logtape/logtape';

import { onboardingRepository } from '@/modules/onboarding/database/queries/onboarding.repository';
import { organizationRepository } from '@/modules/practice/database/queries/organization.repository';
import { findPracticeDetailsByOrganization } from '@/modules/practice/database/queries/practice-details.repository';
import { practiceClientIntakesRepository } from '@/modules/practice-client-intakes/database/queries/practice-client-intakes.repository';
import type { SelectPracticeClientIntake } from '@/modules/practice-client-intakes/database/schema/practice-client-intakes.schema';
import { intakeQueryService } from '@/modules/practice-client-intakes/services/intake-query.service';
import { createIntakePaymentLink } from '@/modules/practice-client-intakes/services/intake-stripe.helpers';
import { executeCreatePracticeClientIntakeTx } from '@/modules/practice-client-intakes/services/intake-transactions.helpers';
import type {
  CreatePracticeClientIntakeRequest,
  UpdatePracticeClientIntakeRequest,
  CreateIntakeResponse as CreatePracticeClientIntakeResponse,
  IntakeSettingsResponse as PracticeClientIntakeSettings,
} from '@/modules/practice-client-intakes/types/practice-client-intakes.types';
import { db } from '@/shared/database';
import { IntakePaymentCreated } from '@/shared/events/definitions';
import type { Result } from '@/shared/types/result';
import type { ServiceContext } from '@/shared/types/service-context';
import { result } from '@/shared/utils/result';

const logger = getLogger(['practice-client-intakes', 'service', 'creation']);

/**
 * Create a new practice client intake
 */
const createPracticeClientIntake = async (
  params: {
    data: CreatePracticeClientIntakeRequest & {
      clientIp?: string;
      userAgent?: string;
      origin?: string | null;
    };
  },
  ctx: ServiceContext,
): Promise<Result<CreatePracticeClientIntakeResponse | PracticeClientIntakeSettings>> => {
  const { data: request } = params;
  try {
    const organization = await organizationRepository.findBySlug(request.slug);

    if (!organization) {
      return result.notFound(`Organization with slug '${request.slug}' not found`);
    }

    const practiceDetails = await findPracticeDetailsByOrganization(organization.id);
    const consultationFee = practiceDetails?.consultation_fee ?? 0;
    const requiresPayment = Boolean(organization.paymentLinkEnabled) && consultationFee > 0;
    const shouldBypassPayment = !requiresPayment || request.amount === 0;

    if (requiresPayment && request.amount < 50) {
      return result.badRequest('Amount must be at least 50 cents when payment is required');
    }

    let paymentLinkUrl: string | null = null;
    let paymentLinkId: string | null = null;
    let connectedAccountId: string | undefined = undefined;
    const validatedUserId = request.user_id;
    const intakeId: string = randomUUID();

    if (!shouldBypassPayment) {
      const settingsResult = await intakeQueryService.getPracticeClientIntakeSettings({ slug: request.slug }, ctx);
      if (!settingsResult.success) {
        return settingsResult;
      }

      const connectedAccount = await onboardingRepository.findByOrganizationId(organization.id);
      if (!connectedAccount || !connectedAccount.stripe_account_id) {
        return result.fail('Connected account not found or Stripe account ID missing');
      }
      connectedAccountId = connectedAccount.id;

      const stripePaymentLink = await createIntakePaymentLink({
        organization: {
          id: organization.id,
          name: organization.name,
          slug: organization.slug,
        },
        connectedAccountStripeId: connectedAccount.stripe_account_id,
        intakeUuid: intakeId,
        request,
      });
      paymentLinkId = stripePaymentLink.id;
      paymentLinkUrl = stripePaymentLink.url;
    }

    const practiceClientIntake = await db.transaction(async (tx) => {
      return await executeCreatePracticeClientIntakeTx(tx, {
        request,
        organizationId: organization.id,
        validatedUserId,
        intakeId,
        connectedAccountId,
        paymentLinkId,
        shouldBypassPayment,
      });
    });

    await ctx.emit(
      IntakePaymentCreated,
      {
        intake_payment_id: practiceClientIntake.id,
        uuid: practiceClientIntake.id,
        stripe_payment_link_id: paymentLinkId ?? undefined,
        amount: request.amount,
        currency: 'usd',
        client_email: request.email,
        client_name: request.name,
        created_at: new Date(),
      },
      undefined,
    );

    return result.ok({
      success: true,
      data: {
        uuid: practiceClientIntake.id,
        payment_link_url: paymentLinkUrl,
        amount: request.amount,
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
    logger.error('Failed to create practice client intake for {slug}: {error}', { error, slug: request.slug });
    return result.internalError('Failed to create practice client intake');
  }
};

/**
 * Update practice client intake amount
 * Note: Payment Links cannot be updated directly. This creates a new Payment Link with the updated amount.
 */
const updatePracticeClientIntake = async (
  params: {
    uuid: string;
    data: UpdatePracticeClientIntakeRequest;
  },
  _ctx: ServiceContext,
): Promise<Result<{ success: boolean; message: string }>> => {
  const { uuid, data: body } = params;

  // NOTE: This operation may modify public intakes before payment.
  // In a robust CASL implementation we might check if this intake belongs
  // to the active organization if called by an admin, but sometimes this is
  // called anonymously by a client filling an intake form.

  try {
    const { amount, court_date, ...restUpdateData } = body;
    const dataToUpdate: Partial<SelectPracticeClientIntake> = {
      ...restUpdateData,
      ...(typeof amount !== 'undefined' && { amount }),
      ...(court_date && { court_date: new Date(court_date) }),
    };

    if (Object.keys(dataToUpdate).length === 0) {
      return result.badRequest('No fields to update provided.');
    }

    const existingIntake = await practiceClientIntakesRepository.findById(uuid);
    if (!existingIntake) {
      return result.notFound(`Practice client intake with UUID '${uuid}' not found`);
    }

    await practiceClientIntakesRepository.update(uuid, dataToUpdate);

    return result.ok({ success: true, message: 'Intake updated successfully.' });
  } catch (error) {
    logger.error('Failed to update practice client intake for {uuid}: {error}', { error, uuid });
    return result.internalError('Failed to update practice client intake');
  }
};

export const intakeCreationService = {
  createPracticeClientIntake,
  updatePracticeClientIntake,
};
