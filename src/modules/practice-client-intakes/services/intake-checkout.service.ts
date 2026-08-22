import { createCheckoutSession as createCheckoutSessionOperation } from '@/modules/practice-client-intakes/operations/create-checkout-session.operation';
import { getIntakeStatus as getIntakeStatusOperation } from '@/modules/practice-client-intakes/operations/get-intake-status.operation';
import { getPostPayStatus as getPostPayStatusOperation } from '@/modules/practice-client-intakes/operations/get-post-pay-status.operation';
import type {
  CreateCheckoutSessionResponse,
  IntakePostPayStatusResponse,
  IntakeStatusResponse,
} from '@/modules/practice-client-intakes/types/practice-client-intakes.types';
import type { ServiceContext } from '@/shared/types/service-context';
import { ForbiddenError } from '@casl/ability';
import { getLogger } from '@logtape/logtape';

const logger = getLogger(['practice-client-intakes', 'service']);

const toIntakeActorContext = (ctx: ServiceContext) => ({
  organizationId: ctx.organizationId,
  userId: ctx.userId,
  isStaff: Boolean(ctx.memberRole),
});

/** Staff CASL authorization stays at this boundary; the operation only knows the resolved `isStaff` flag. */
const authorizeStaffAction = (ctx: ServiceContext, action: 'read' | 'update'): void => {
  if (ctx.memberRole) {
    ForbiddenError.from(ctx.ability).throwUnlessCan(action, 'PracticeClientIntake');
  }
};

const createCheckoutSession = async (
  params: { uuid: string; origin?: string | null },
  ctx: ServiceContext
): Promise<CreateCheckoutSessionResponse> => {
  try {
    authorizeStaffAction(ctx, 'update');
    return await createCheckoutSessionOperation(params, toIntakeActorContext(ctx));
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
    authorizeStaffAction(ctx, 'read');
    return await getIntakeStatusOperation(params, toIntakeActorContext(ctx));
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
    return await getPostPayStatusOperation(params, { scope: 'public' });
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
