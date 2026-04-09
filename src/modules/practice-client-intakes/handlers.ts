import type { Context } from 'hono';
import type { publicRoutes } from '@/modules/practice-client-intakes/routes/public.routes';
import type { clientRoutes } from '@/modules/practice-client-intakes/routes/client.routes';
import type { staffRoutes } from '@/modules/practice-client-intakes/routes/staff.routes';
import { intakeCheckoutService } from '@/modules/practice-client-intakes/services/intake-checkout.service';
import { intakeCreationService } from '@/modules/practice-client-intakes/services/intake-creation.service';
import { intakeLifecycleService } from '@/modules/practice-client-intakes/services/intake-lifecycle.service';
import { createBetterAuthInstance } from '@/shared/auth/better-auth';
import { db } from '@/shared/database';
import { getLogger } from '@logtape/logtape';
import type { AppRouteHandler } from '@/shared/types/hono';
import { getServiceContext } from '@/shared/types/service-context';
import { sendResult } from '@/shared/utils/responseUtils';
import { extractOriginFromReferer } from '@/shared/utils/env';

const logger = getLogger(['practice-client-intakes', 'handlers']);

const getCreateIntakeRequestMetadata = (c: Context) => ({
  clientIp: c.req.header('x-forwarded-for') ?? c.req.header('remote-addr'),
  userAgent: c.req.header('user-agent'),
  origin: c.req.header('origin') ?? extractOriginFromReferer(c.req.header('referer')),
});

const getIntakeSettingsHandler: AppRouteHandler<typeof publicRoutes.getIntakeSettingsRoute> = async (c) => {
  const { slug } = c.req.valid('param');
  const result = await intakeCreationService.getIntakeSettings({ slug });
  return sendResult(c, result, 200);
};

const createPracticeClientIntakeHandler: AppRouteHandler<typeof publicRoutes.createPracticeClientIntakeRoute> = async (
  c
) => {
  const body = c.req.valid('json');

  let sessionUserId: string | undefined = undefined;
  try {
    const auth = createBetterAuthInstance(db);
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    sessionUserId = session?.user?.id;
  } catch (error) {
    // Public route: anonymous submission is valid. Log infrastructure errors but don't block.
    logger.warn('Session resolution failed on public intake route, proceeding anonymously: {error}', { error });
  }

  const result = await intakeCreationService.createIntake({
    data: {
      ...body,
      // Session-derived userId always wins; never trust a client-supplied user_id.
      user_id: sessionUserId,
      ...getCreateIntakeRequestMetadata(c),
    },
  });
  return sendResult(c, result, 201);
};

const createPracticeClientIntakeCheckoutSessionHandler: AppRouteHandler<
  typeof clientRoutes.createPracticeClientIntakeCheckoutSessionRoute
> = async (c) => {
  const ctx = getServiceContext(c);
  const { uuid } = c.req.valid('param');
  const origin = c.req.header('origin') ?? extractOriginFromReferer(c.req.header('referer'));
  const result = await intakeCheckoutService.createCheckoutSession(
    {
      uuid,
      origin,
    },
    ctx
  );
  return sendResult(c, result, 201);
};

const updatePracticeClientIntakeHandler: AppRouteHandler<typeof clientRoutes.updatePracticeClientIntakeRoute> = async (
  c
) => {
  const ctx = getServiceContext(c);
  const { uuid } = c.req.valid('param');
  const body = c.req.valid('json');
  const result = await intakeCreationService.updateIntake({ uuid, data: body }, ctx);
  return sendResult(c, result, 200);
};

const getPracticeClientIntakeStatusHandler: AppRouteHandler<
  typeof clientRoutes.getPracticeClientIntakeStatusRoute
> = async (c) => {
  const ctx = getServiceContext(c);
  const { uuid } = c.req.valid('param');
  const result = await intakeCheckoutService.getIntakeStatus({ uuid }, ctx);
  return sendResult(c, result, 200);
};

const getPracticeClientIntakePostPayStatusHandler: AppRouteHandler<
  typeof publicRoutes.getPracticeClientIntakePostPayStatusRoute
> = async (c) => {
  const { session_id: sessionId } = c.req.valid('query');
  const result = await intakeCheckoutService.getPostPayStatus({ sessionId });
  return sendResult(c, result, 200);
};

const triggerIntakeInvitationHandler: AppRouteHandler<typeof staffRoutes.triggerIntakeInvitationRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { uuid } = c.req.valid('param');
  const result = await intakeLifecycleService.triggerInvitation(
    { uuid, origin: c.req.header('origin') ?? extractOriginFromReferer(c.req.header('referer')) },
    ctx
  );
  return sendResult(c, result, 200);
};

const listIntakesHandler: AppRouteHandler<typeof staffRoutes.listIntakesRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const query = c.req.valid('query');
  const result = await intakeLifecycleService.listIntakes({ query }, ctx);
  return sendResult(c, result, 200);
};

const getIntakeHandler: AppRouteHandler<typeof staffRoutes.getIntakeRoute> = async (c) => {
  const { id } = c.req.valid('param');
  const ctx = getServiceContext(c);
  const result = await intakeLifecycleService.getIntakeById(id, ctx);
  return sendResult(c, result, 200);
};

const convertIntakeHandler: AppRouteHandler<typeof staffRoutes.convertIntakeRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { uuid } = c.req.valid('param');
  const body = c.req.valid('json');
  const result = await intakeLifecycleService.convertIntake({ uuid, data: body }, ctx);
  return sendResult(c, result, 201);
};

const updateIntakeTriageStatusHandler: AppRouteHandler<typeof staffRoutes.updateIntakeTriageStatusRoute> = async (
  c
) => {
  const ctx = getServiceContext(c);
  const { uuid } = c.req.valid('param');
  const body = c.req.valid('json');
  const result = await intakeLifecycleService.updateTriageStatus({ uuid, data: body }, ctx);
  return sendResult(c, result, 200);
};

export const handlers = {
  getIntakeSettingsHandler,
  createPracticeClientIntakeHandler,
  createPracticeClientIntakeCheckoutSessionHandler,
  updatePracticeClientIntakeHandler,
  getPracticeClientIntakeStatusHandler,
  getPracticeClientIntakePostPayStatusHandler,
  triggerIntakeInvitationHandler,
  listIntakesHandler,
  getIntakeHandler,
  updateIntakeTriageStatusHandler,
  convertIntakeHandler,
};
