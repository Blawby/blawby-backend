import { onboardingRepository } from '@/modules/onboarding/database/queries/onboarding.repository';
import { connectedAccountsService } from '@/modules/onboarding/services/connected-accounts.service';
import { organizationRepository } from '@/modules/practice/database/queries/organization.repository';
import { practiceClientIntakesRepository } from '@/modules/practice-client-intakes/database/queries/practice-client-intakes.repository';
import { getActorAccessibleIntake } from '@/modules/practice-client-intakes/services/intake-access.helpers';
import { getLogger } from '@logtape/logtape';
import { intakeSharedHelpers } from '@/modules/practice-client-intakes/services/intake-shared.helpers';
import { createIntakeCheckoutSession } from '@/modules/practice-client-intakes/services/intake-stripe.helpers';
import type {
  CreateCheckoutSessionResponse,
  IntakePostPayStatusResponse,
  IntakeStatusResponse,
} from '@/modules/practice-client-intakes/types/practice-client-intakes.types';
import type { ServiceContext } from '@/shared/types/service-context';
import { HTTPException } from 'hono/http-exception';

const logger = getLogger(['practice-client-intakes', 'service']);

const buildUpdatedMetadata = (ctx: ServiceContext, practiceClientIntake: { metadata: unknown }) => {
  const baseMetadata = intakeSharedHelpers.parseMetadata(practiceClientIntake.metadata);
  if (ctx.userId) {
    return {
      ...(baseMetadata ?? { email: '', name: '' }),
      user_id: baseMetadata?.user_id ?? ctx.userId,
    };
  }
  return baseMetadata ?? undefined;
};

const createCheckoutSession = async (
  params: { uuid: string; origin?: string | null },
  ctx: ServiceContext
): Promise<CreateCheckoutSessionResponse> => {
  try {
    const practiceClientIntake = await getActorAccessibleIntake(params.uuid, ctx, 'update');
    if (practiceClientIntake.status !== 'open') {
      throw new HTTPException(400, { message: 'Intake is not eligible for checkout session creation' });
    }

    const organization = await organizationRepository.findById(practiceClientIntake.organization_id);
    if (!organization) {
      throw new HTTPException(404, { message: 'Organization not found' });
    }

    const connectedAccount = await onboardingRepository.findByOrganizationId(organization.id);
    if (!connectedAccount) {
      throw new Error('Connected account not found');
    }

    if (!(await connectedAccountsService.isAccountActive(connectedAccount))) {
      throw new HTTPException(403, { message: 'Connected account is not ready to accept payments' });
    }

    if (practiceClientIntake.stripe_checkout_session_id) {
      try {
        const resolveResult = await intakeSharedHelpers.resolvePracticeClientIntakeByCheckoutSessionId(
          practiceClientIntake.stripe_checkout_session_id,
          { requireSession: true }
        );

        const existingSession = resolveResult.session;

        const isReusable = existingSession?.status === 'open' && existingSession.payment_status !== 'paid';

        if (isReusable && existingSession.url) {
          return {
            success: true,
            data: {
              url: existingSession.url,
              session_id: existingSession.id,
            },
          };
        }
      } catch (error) {
        logger.error('Failed to retrieve checkout session for intake {uuid}: {error}', {
          uuid: practiceClientIntake.id,
          error,
        });
      }
    }

    const metadata = intakeSharedHelpers.parseMetadata(practiceClientIntake.metadata) ?? { email: '', name: '' };

    const session = await createIntakeCheckoutSession({
      currency: practiceClientIntake.currency,
      amount: practiceClientIntake.amount,
      email: metadata.email,
      name: metadata.name,
      phone: metadata.phone,
      on_behalf_of: metadata.on_behalf_of,
      opposing_party: metadata.opposing_party,
      description: metadata.description,
      organizationId: organization.id,
      organizationName: organization.name,
      organizationSlug: organization.slug,
      intakeId: practiceClientIntake.id,
      stripeAccountId: connectedAccount.stripe_account_id,
      origin: params.origin,
      conversationId: practiceClientIntake.conversation_id,
      userId: ctx.userId,
    });

    if (!session.url) {
      throw new HTTPException(500, { message: 'Stripe Checkout Session URL missing' });
    }

    const updatedMetadata = buildUpdatedMetadata(ctx, practiceClientIntake);

    await practiceClientIntakesRepository.update(practiceClientIntake.id, {
      stripe_checkout_session_id: session.id,
      metadata: updatedMetadata,
    });

    return {
      success: true,
      data: {
        url: session.url,
        session_id: session.id,
      },
    };
  } catch (error) {
    logger.error('Failed to create checkout session for intake {uuid}: {error}', {
      uuid: params.uuid,
      error,
    });
    throw error;
  }
};

const getIntakeStatus = async (params: { uuid: string }, ctx: ServiceContext): Promise<IntakeStatusResponse> => {
  try {
    const intake = await getActorAccessibleIntake(params.uuid, ctx, 'read');

    return {
      success: true,
      data: intakeSharedHelpers.formatIntakeStatusResponse(intake, {
        requestingUserId: ctx.userId,
        isAdmin: Boolean(ctx.memberRole),
      }),
    };
  } catch (error) {
    logger.error('Failed to get practice client intake status for {uuid}: {error}', {
      uuid: params.uuid,
      error,
    });
    throw error;
  }
};

const getPostPayStatus = async (params: { sessionId: string }): Promise<IntakePostPayStatusResponse> => {
  try {
    const { intake } = await intakeSharedHelpers.resolvePracticeClientIntakeByCheckoutSessionId(params.sessionId);
    if (!intake) {
      throw new HTTPException(404, { message: 'Checkout session not found' });
    }

    if (intake.status !== 'succeeded') {
      return {
        success: true,
        data: {
          paid: false,
        },
      };
    }

    return {
      success: true,
      data: {
        paid: true,
        intake_uuid: intake.id,
        organization_id: intake.organization_id,
      },
    };
  } catch (error) {
    logger.error('Failed to get post-pay status for session {sessionId}: {error}', {
      sessionId: params.sessionId,
      error,
    });
    throw error;
  }
};

export const intakeCheckoutService = {
  createCheckoutSession,
  getIntakeStatus,
  getPostPayStatus,
};
