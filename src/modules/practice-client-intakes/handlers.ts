import { getLogger } from '@logtape/logtape';
import type { Context } from 'hono';

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
  updateIntakeTriageStatusRoute,
  convertIntakeRoute,
} from '@/modules/practice-client-intakes/routes';
import { intakeCheckoutService } from '@/modules/practice-client-intakes/services/intake-checkout.service';
import { intakeConvertService } from '@/modules/practice-client-intakes/services/intake-convert.service';
import { intakeCreationService } from '@/modules/practice-client-intakes/services/intake-creation.service';
import { intakeLifecycleService } from '@/modules/practice-client-intakes/services/intake-lifecycle.service';
import { intakeQueryService } from '@/modules/practice-client-intakes/services/intake-query.service';
import type { AppRouteHandler } from '@/shared/types/hono';
import { getServiceContext } from '@/shared/types/service-context';
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
  const ctx = getServiceContext(c);
  const { slug } = c.req.valid('param');

  const result = await intakeQueryService.getPracticeClientIntakeSettings({ slug }, ctx);
  return response.fromResult(c, result);
};

export const createPracticeClientIntakeHandler: AppRouteHandler<typeof createPracticeClientIntakeRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const body = c.req.valid('json');

  const result = await intakeCreationService.createPracticeClientIntake({
    data: {
      ...body,
      clientIp: c.req.header('x-forwarded-for') || c.req.header('remote-addr'),
      userAgent: c.req.header('user-agent'),
      origin: c.req.header('origin'),
    },
  }, ctx);

  return response.fromResult(c, result, 201);
};

export const createPracticeClientIntakeCheckoutSessionHandler: AppRouteHandler<
  typeof createPracticeClientIntakeCheckoutSessionRoute
> = async (c) => {
  const ctx = getServiceContext(c);
  const { uuid } = c.req.valid('param');

  const user_id = ctx.userId ?? await getOptionalSessionUserId(c) ?? undefined;

  const result = await intakeCheckoutService.createPracticeClientIntakeCheckoutSession({
    uuid,
    user_id,
    origin: c.req.header('origin'),
  }, ctx);

  return response.fromResult(c, result, 201);
};

export const updatePracticeClientIntakeHandler: AppRouteHandler<typeof updatePracticeClientIntakeRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { uuid } = c.req.valid('param');
  const body = c.req.valid('json');

  const result = await intakeCreationService.updatePracticeClientIntake({ uuid, data: body }, ctx);
  return response.fromResult(c, result);
};

export const getPracticeClientIntakeStatusHandler: AppRouteHandler<
  typeof getPracticeClientIntakeStatusRoute
> = async (c) => {
  const ctx = getServiceContext(c);
  const { uuid } = c.req.valid('param');

  const requestingUserId = ctx.userId ?? await getOptionalSessionUserId(c) ?? undefined;

  const result = await intakeCheckoutService.getPracticeClientIntakeStatus({ uuid, requestingUserId }, ctx);
  return response.fromResult(c, result);
};

export const getPracticeClientIntakePostPayStatusHandler: AppRouteHandler<
  typeof getPracticeClientIntakePostPayStatusRoute
> = async (c) => {
  const ctx = getServiceContext(c);
  const { session_id: sessionId } = c.req.valid('query');

  const result = await intakeCheckoutService.getPracticeClientIntakePostPayStatus({ sessionId }, ctx);
  return response.fromResult(c, result);
};

export const claimPracticeClientIntakeHandler: AppRouteHandler<typeof claimPracticeClientIntakeRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { session_id } = c.req.valid('json');

  const result = await intakeLifecycleService.claimPracticeClientIntakePayment({
    session_id,
    user_id: ctx.userId,
  }, ctx);

  return response.fromResult(c, result);
};

export const triggerIntakeInvitationHandler: AppRouteHandler<
  typeof triggerIntakeInvitationRoute
> = async (c) => {
  const ctx = getServiceContext(c);
  const { uuid } = c.req.valid('param');

  const result = await intakeLifecycleService.triggerIntakeInvitation({
    uuid,
    sessionUserId: ctx.userId,
    origin: c.req.header('origin'),
  }, ctx);

  return response.fromResult(c, result);
};

export const listIntakesHandler: AppRouteHandler<typeof listIntakesRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { practice_id: practiceId } = c.req.valid('param');
  const query = c.req.valid('query');

  const result = await intakeQueryService.listIntakes({ practiceId, query }, ctx);
  return response.fromResult(c, result);
};

export const convertIntakeHandler: AppRouteHandler<typeof convertIntakeRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { uuid } = c.req.valid('param');
  const body = c.req.valid('json');

  const result = await intakeConvertService.convertIntakeToMatter({
    uuid,
    organizationId: ctx.organizationId,
    actorUserId: ctx.userId,
    data: body,
  }, ctx);

  return response.fromResult(c, result, 201);
};

export const updateIntakeTriageStatusHandler: AppRouteHandler<typeof updateIntakeTriageStatusRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { uuid } = c.req.valid('param');
  const body = c.req.valid('json');

  const result = await intakeQueryService.updateIntakeTriageStatus({
    uuid,
    organizationId: ctx.organizationId,
    data: body,
  }, ctx);

  return response.fromResult(c, result);
};
