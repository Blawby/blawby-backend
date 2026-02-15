import { getLogger } from '@logtape/logtape';
import type { Context } from 'hono';
import { practiceClientIntakesRepository } from '@/modules/practice-client-intakes/database/queries/practice-client-intakes.repository';
import {
  getIntakeSettingsRoute,
  createPracticeClientIntakeRoute,
  createPracticeClientIntakeCheckoutSessionRoute,
  updatePracticeClientIntakeRoute,
  getPracticeClientIntakeStatusRoute,
  getPracticeClientIntakePostPayStatusRoute,
  claimPracticeClientIntakeRoute,
  triggerIntakeInvitationRoute,
  listIntakesRoute,
  convertIntakeRoute,
} from '@/modules/practice-client-intakes/routes';
import { practiceClientIntakesService } from '@/modules/practice-client-intakes/services/practice-client-intakes.service';
import type { AppRouteHandler } from '@/shared/types/hono';
import { response } from '@/shared/utils/responseUtils';

const logger = getLogger(['practice-client-intakes', 'handlers']);

/**
 * Get optional session user ID from better-auth
 */
async function getOptionalSessionUserId(c: Context): Promise<string | null> {
  try {
    const session = await c.get('auth').api.getSession({
      headers: c.req.raw.headers,
    });
    return session?.user?.id ?? null;
  } catch (err) {
    logger.debug('No active session found (optional)', { error: err });
    return null;
  }
}

export const getIntakeSettingsHandler: AppRouteHandler<typeof getIntakeSettingsRoute> = async (c) => {
  const { slug } = c.req.valid('param');
  const result = await practiceClientIntakesService.getPracticeClientIntakeSettings(slug);
  return response.fromResult(c, result);
};

export const createPracticeClientIntakeHandler: AppRouteHandler<typeof createPracticeClientIntakeRoute> = async (c) => {
  const body = c.req.valid('json');
  const clientIp = c.req.header('x-forwarded-for') || c.req.header('remote-addr');
  const userAgent = c.req.header('user-agent');
  const origin = c.req.header('origin');

  const result = await practiceClientIntakesService.createPracticeClientIntake({
    ...body,
    clientIp,
    userAgent,
    origin,
  });

  return response.fromResult(c, result, 201);
};

export const createPracticeClientIntakeCheckoutSessionHandler: AppRouteHandler<
  typeof createPracticeClientIntakeCheckoutSessionRoute
> = async (c) => {
  const { uuid } = c.req.valid('param');
  const sessionUserId = await getOptionalSessionUserId(c);
  const result = await practiceClientIntakesService.createPracticeClientIntakeCheckoutSession({
    uuid,
    user_id: sessionUserId ?? undefined,
    origin: c.req.header('origin'),
  });
  return response.fromResult(c, result, 201);
};

export const updatePracticeClientIntakeHandler: AppRouteHandler<typeof updatePracticeClientIntakeRoute> = async (c) => {
  const { uuid } = c.req.valid('param');
  const { amount } = c.req.valid('json');
  const result = await practiceClientIntakesService.updatePracticeClientIntake(uuid, amount);
  return response.fromResult(c, result);
};

export const getPracticeClientIntakeStatusHandler: AppRouteHandler<
  typeof getPracticeClientIntakeStatusRoute> = async (c) => {
    const { uuid } = c.req.valid('param');
    const sessionUserId = await getOptionalSessionUserId(c);
    const result = await practiceClientIntakesService.getPracticeClientIntakeStatus(uuid, sessionUserId ?? undefined);
    return response.fromResult(c, result);
  };

export const getPracticeClientIntakePostPayStatusHandler: AppRouteHandler<
  typeof getPracticeClientIntakePostPayStatusRoute> = async (c) => {
    const { session_id: sessionId } = c.req.valid('query');
    const result = await practiceClientIntakesService.getPracticeClientIntakePostPayStatus(sessionId);
    return response.fromResult(c, result);
  };

export const claimPracticeClientIntakeHandler: AppRouteHandler<typeof claimPracticeClientIntakeRoute> = async (c) => {
  const { session_id: sessionId } = c.req.valid('json');
  const sessionUserId = c.get('userId');

  if (!sessionUserId) {
    return response.unauthorized(c, 'Authentication required to claim intake');
  }

  const result = await practiceClientIntakesService.claimPracticeClientIntakePayment({
    session_id: sessionId,
    user_id: sessionUserId,
  });

  return response.fromResult(c, result);
};

export const triggerIntakeInvitationHandler: AppRouteHandler<
  typeof triggerIntakeInvitationRoute
> = async (c) => {
  const { uuid } = c.req.valid('param');
  const sessionUserId = c.get('userId');

  if (!sessionUserId) {
    return response.unauthorized(c, 'Authentication required to trigger invitation');
  }

  const result = await practiceClientIntakesService.triggerIntakeInvitation(
    uuid,
    sessionUserId,
    c.req.raw.headers,
  );

  return response.fromResult(c, result);
};

export const listIntakesHandler: AppRouteHandler<typeof listIntakesRoute> = async (c) => {
  const { practice_id: practiceId } = c.req.valid('param');
  const query = c.req.valid('query');

  const result = await practiceClientIntakesService.listIntakes(practiceId, query);

  return response.fromResult(c, result);
};

export const convertIntakeHandler: AppRouteHandler<typeof convertIntakeRoute> = async (c) => {
  const { uuid } = c.req.valid('param');
  const body = c.req.valid('json');

  // We need organizationId for the service call, so we fetch the intake record first.
  const intake = await practiceClientIntakesRepository.findById(uuid);
  if (!intake) {
    return response.notFound(c, 'Practice client intake not found');
  }

  const result = await practiceClientIntakesService.convertIntakeToMatter(uuid, intake.organization_id, body);

  return response.fromResult(c, result);
};
