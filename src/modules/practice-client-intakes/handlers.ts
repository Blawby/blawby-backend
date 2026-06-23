import type { Context } from 'hono';
import type { publicRoutes } from '@/modules/practice-client-intakes/routes/public.routes';
import type { clientRoutes } from '@/modules/practice-client-intakes/routes/client.routes';
import type { staffRoutes } from '@/modules/practice-client-intakes/routes/staff.routes';
import type { intakeFileRoutes } from '@/modules/practice-client-intakes/routes/intake-files.routes';
import { intakeCheckoutService } from '@/modules/practice-client-intakes/services/intake-checkout.service';
import { intakeCreationService } from '@/modules/practice-client-intakes/services/intake-creation.service';
import { intakeFilesService } from '@/modules/practice-client-intakes/services/intake-files.service';
import { intakeLifecycleService } from '@/modules/practice-client-intakes/services/intake-lifecycle.service';
import { createBetterAuthInstance } from '@/shared/auth/better-auth';
import { db } from '@/shared/database';
import { getLogger } from '@logtape/logtape';
import type { AppRouteHandler } from '@/shared/types/hono';
import { getServiceContext } from '@/shared/types/service-context';
import { extractOriginFromReferer } from '@/shared/utils/env';

const logger = getLogger(['practice-client-intakes', 'handlers']);

const getCreateIntakeRequestMetadata = (c: Context) => ({
  clientIp: c.req.header('x-forwarded-for') ?? c.req.header('remote-addr'),
  userAgent: c.req.header('user-agent'),
  origin: c.req.header('origin') ?? extractOriginFromReferer(c.req.header('referer')),
});

const getIntakeSettingsHandler: AppRouteHandler<typeof publicRoutes.getIntakeSettingsRoute> = async (c) => {
  const { slug } = c.req.valid('param');
  const { template_slug } = c.req.valid('query');
  const data = await intakeCreationService.getIntakeSettings({ slug, templateSlug: template_slug });
  return c.json(data, 200);
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

  const data = await intakeCreationService.createIntake({
    data: {
      ...body,
      // Session-derived userId always wins; never trust a client-supplied user_id.
      user_id: sessionUserId,
      ...getCreateIntakeRequestMetadata(c),
    },
  });
  return c.json(data, 201);
};

const createPracticeClientIntakeCheckoutSessionHandler: AppRouteHandler<
  typeof clientRoutes.createPracticeClientIntakeCheckoutSessionRoute
> = async (c) => {
  const ctx = getServiceContext(c);
  const { uuid } = c.req.valid('param');
  const origin = c.req.header('origin') ?? extractOriginFromReferer(c.req.header('referer'));
  const data = await intakeCheckoutService.createCheckoutSession(
    {
      uuid,
      origin,
    },
    ctx
  );
  return c.json(data, 201);
};

const updatePracticeClientIntakeHandler: AppRouteHandler<typeof clientRoutes.updatePracticeClientIntakeRoute> = async (
  c
) => {
  const ctx = getServiceContext(c);
  const { uuid } = c.req.valid('param');
  const body = c.req.valid('json');
  const data = await intakeCreationService.updateIntake({ uuid, data: body }, ctx);
  return c.json(data, 200);
};

const getPracticeClientIntakeStatusHandler: AppRouteHandler<
  typeof clientRoutes.getPracticeClientIntakeStatusRoute
> = async (c) => {
  const ctx = getServiceContext(c);
  const { uuid } = c.req.valid('param');
  const data = await intakeCheckoutService.getIntakeStatus({ uuid }, ctx);
  return c.json(data, 200);
};

const getPracticeClientIntakePostPayStatusHandler: AppRouteHandler<
  typeof publicRoutes.getPracticeClientIntakePostPayStatusRoute
> = async (c) => {
  const { session_id: sessionId } = c.req.valid('query');
  const data = await intakeCheckoutService.getPostPayStatus({ sessionId });
  return c.json(data, 200);
};

const triggerIntakeInvitationHandler: AppRouteHandler<typeof staffRoutes.triggerIntakeInvitationRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { uuid } = c.req.valid('param');
  const data = await intakeLifecycleService.triggerInvitation(
    { uuid, origin: c.req.header('origin') ?? extractOriginFromReferer(c.req.header('referer')) },
    ctx
  );
  return c.json(data, 200);
};

const listIntakesHandler: AppRouteHandler<typeof staffRoutes.listIntakesRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const query = c.req.valid('query');
  const data = await intakeLifecycleService.listIntakes({ query }, ctx);
  return c.json(data, 200);
};

const getIntakeHandler: AppRouteHandler<typeof staffRoutes.getIntakeRoute> = async (c) => {
  const { id } = c.req.valid('param');
  const ctx = getServiceContext(c);
  const data = await intakeLifecycleService.getIntakeById(id, ctx);
  return c.json(data, 200);
};

const convertIntakeHandler: AppRouteHandler<typeof staffRoutes.convertIntakeRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { uuid } = c.req.valid('param');
  const body = c.req.valid('json');
  const data = await intakeLifecycleService.convertIntake({ uuid, data: body }, ctx);
  return c.json(data, 201);
};

const updateIntakeTriageStatusHandler: AppRouteHandler<typeof staffRoutes.updateIntakeTriageStatusRoute> = async (
  c
) => {
  const ctx = getServiceContext(c);
  const { uuid } = c.req.valid('param');
  const body = c.req.valid('json');
  const data = await intakeLifecycleService.updateTriageStatus({ uuid, data: body }, ctx);
  return c.json(data, 200);
};

const presignIntakeFileHandler: AppRouteHandler<typeof intakeFileRoutes.presignIntakeFileRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { uuid } = c.req.valid('param');
  const body = c.req.valid('json');
  const result = await intakeFilesService.presignFile({ uuid, body }, ctx);
  return c.json(result, 201);
};

const confirmIntakeFileHandler: AppRouteHandler<typeof intakeFileRoutes.confirmIntakeFileRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { uuid, upload_id: uploadId } = c.req.valid('param');
  const result = await intakeFilesService.confirmFile({ uuid, uploadId }, ctx);
  return c.json(result, 200);
};

const listIntakeFilesHandler: AppRouteHandler<typeof intakeFileRoutes.listIntakeFilesRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { uuid } = c.req.valid('param');
  const query = c.req.valid('query');
  const result = await intakeFilesService.listFiles({ uuid, query }, ctx);
  return c.json(result, 200);
};

const deleteIntakeFileHandler: AppRouteHandler<typeof intakeFileRoutes.deleteIntakeFileRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { uuid, upload_id: uploadId } = c.req.valid('param');
  const { reason } = c.req.valid('json');
  const result = await intakeFilesService.deleteFile({ uuid, uploadId, reason }, ctx);
  return c.json(result, 200);
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
  presignIntakeFileHandler,
  confirmIntakeFileHandler,
  listIntakeFilesHandler,
  deleteIntakeFileHandler,
};
