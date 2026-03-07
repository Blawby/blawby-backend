import { getLogger } from '@logtape/logtape';

import { onboardingRepository } from '@/modules/onboarding/database/queries/onboarding.repository';
import { isAccountActive } from '@/modules/onboarding/services/connected-accounts.service';
import { organizationRepository } from '@/modules/practice/database/queries/organization.repository';
import { practiceClientIntakesRepository } from '@/modules/practice-client-intakes/database/queries/practice-client-intakes.repository';
import type { PracticeClientIntakeMetadata } from '@/modules/practice-client-intakes/database/schema/practice-client-intakes.schema';
import { formatIntakeResponse, parseMetadata, resolvePracticeClientIntakeByCheckoutSessionId } from '@/modules/practice-client-intakes/services/intake-shared.helpers';
import { createIntakeCheckoutSession } from '@/modules/practice-client-intakes/services/intake-stripe.helpers';
import type {
  CreateCheckoutSessionResponse as PracticeClientIntakeCheckoutSessionResponse,
  IntakeStatusResponse as PracticeClientIntakeStatus,
  IntakePostPayStatusResponse as PracticeClientIntakePostPayStatusResponse,
} from '@/modules/practice-client-intakes/types/practice-client-intakes.types';
import type { Result } from '@/shared/types/result';
import type { ServiceContext } from '@/shared/types/service-context';
import { result } from '@/shared/utils/result';

const logger = getLogger(['practice-client-intakes', 'service', 'checkout']);

/**
 * Create a Stripe Checkout Session for an existing intake
 */
const createPracticeClientIntakeCheckoutSession = async (
  params: { uuid: string; user_id?: string; origin?: string | null },
  _ctx: ServiceContext,
): Promise<Result<PracticeClientIntakeCheckoutSessionResponse>> => {
  const { uuid, user_id, origin } = params;
  try {
    const practiceClientIntake = await practiceClientIntakesRepository.findById(uuid);
    if (!practiceClientIntake) {
      return result.notFound(`Practice client intake with UUID '${uuid}' not found`);
    }

    if (practiceClientIntake.status !== 'open') {
      return result.badRequest('Intake is not eligible for checkout session creation');
    }

    const organization = await organizationRepository.findById(practiceClientIntake.organization_id);
    if (!organization) {
      return result.notFound('Organization not found');
    }

    const connectedAccount = await onboardingRepository.findByOrganizationId(organization.id);
    if (!connectedAccount || !connectedAccount.stripe_account_id) {
      return result.fail('Connected account not found or Stripe account ID missing');
    }

    if (!(await isAccountActive(connectedAccount))) {
      return result.forbidden('Connected account is not ready to accept payments');
    }

    // Reuse any existing session to avoid duplicate Checkout Sessions for the same intake.
    if (practiceClientIntake.stripe_checkout_session_id) {
      try {
        const { session: existingSession } = await resolvePracticeClientIntakeByCheckoutSessionId(
          practiceClientIntake.stripe_checkout_session_id,
          { requireSession: true },
        );

        const isReusable = existingSession
          && existingSession.status === 'open'
          && existingSession.payment_status !== 'paid';

        if (isReusable && existingSession?.url) {
          return result.ok({
            success: true,
            data: {
              url: existingSession.url,
              session_id: existingSession.id,
            },
          });
        }
      } catch (error) {
        logger.error('Failed to retrieve checkout session for intake {uuid}: {error}', {
          uuid: practiceClientIntake.id,
          error,
        });
        // If retrieval fails, create a new session below
      }
    }

    const session = await createIntakeCheckoutSession({
      organization: {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
      },
      connectedAccountStripeId: connectedAccount.stripe_account_id,
      intake: practiceClientIntake,
      request: { user_id, origin },
    });

    if (!session.url) {
      return result.internalError('Stripe Checkout Session URL missing');
    }

    const updatedMetadata: PracticeClientIntakeMetadata | undefined = user_id
      ? {
        ...(parseMetadata(practiceClientIntake.metadata) ?? { email: '', name: '' }),
        user_id: parseMetadata(practiceClientIntake.metadata)?.user_id ?? user_id,
      }
      : parseMetadata(practiceClientIntake.metadata) ?? undefined;

    await practiceClientIntakesRepository.update(practiceClientIntake.id, {
      stripe_checkout_session_id: session.id,
      metadata: updatedMetadata ?? undefined,
    });

    return result.ok({
      success: true,
      data: {
        url: session.url,
        session_id: session.id,
      },
    });
  } catch (error) {
    logger.error('Failed to create checkout session for intake {uuid}: {error}', {
      uuid,
      error,
    });
    return result.internalError('Failed to create checkout session');
  }
};

/**
 * Get practice client intake status by UUID
 */
const getPracticeClientIntakeStatus = async (
  params: { uuid: string; requestingUserId?: string },
  _ctx: ServiceContext,
): Promise<Result<PracticeClientIntakeStatus>> => {
  const { uuid, requestingUserId } = params;
  try {
    const practiceClientIntake = await practiceClientIntakesRepository.findById(uuid);
    if (!practiceClientIntake) {
      return result.notFound(`Practice client intake with UUID '${uuid}' not found`);
    }

    return result.ok({
      success: true,
      data: formatIntakeResponse(practiceClientIntake, { requestingUserId }) satisfies PracticeClientIntakeStatus['data'],
    });
  } catch (error) {
    logger.error('Failed to get practice client intake status for {uuid}: {error}', { error, uuid });
    return result.internalError('Failed to get practice client intake status');
  }
};

/**
 * Get practice client intake post-pay status by Checkout Session ID
 */
const getPracticeClientIntakePostPayStatus = async (
  params: { sessionId: string },
  _ctx: ServiceContext,
): Promise<Result<PracticeClientIntakePostPayStatusResponse>> => {
  const { sessionId } = params;
  try {
    const { intake } = await resolvePracticeClientIntakeByCheckoutSessionId(sessionId);

    if (!intake) {
      return result.notFound('Checkout session not found');
    }

    if (intake.status !== 'succeeded') {
      return result.ok({
        success: true,
        data: {
          paid: false,
        },
      });
    }

    return result.ok({
      success: true,
      data: {
        paid: true,
        intake_uuid: intake.id,
        organization_id: intake.organization_id,
      },
    });
  } catch (error) {
    logger.error('Failed to get post-pay status for session {sessionId}: {error}', {
      sessionId,
      error,
    });
    return result.internalError('Failed to get post-pay status');
  }
};

export const intakeCheckoutService = {
  createPracticeClientIntakeCheckoutSession,
  getPracticeClientIntakeStatus,
  getPracticeClientIntakePostPayStatus,
};
