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
import { intakeCreationService } from '@/modules/practice-client-intakes/services/intake-creation.service';
import { intakeLifecycleService } from '@/modules/practice-client-intakes/services/intake-lifecycle.service';
import type { AppRouteHandler } from '@/shared/types/hono';
import { getServiceContext } from '@/shared/types/service-context';
import { response } from '@/shared/utils/responseUtils';

const getCreateIntakeRequestMetadata = (c: Context) => ({
  clientIp: c.req.header('x-forwarded-for') || c.req.header('remote-addr'),
  userAgent: c.req.header('user-agent'),
  origin: c.req.header('origin'),
});

export const getIntakeSettingsHandler: AppRouteHandler<typeof getIntakeSettingsRoute> = async (c) => {
  const { slug } = c.req.valid('param');
  const result = await intakeCreationService.getIntakeSettings({ slug });
  return response.fromResult(c, result);
};

export const createPracticeClientIntakeHandler: AppRouteHandler<typeof createPracticeClientIntakeRoute> = async (c) => {
  const body = c.req.valid('json');
  const result = await intakeCreationService.createIntake({
    data: {
      ...body,
      ...getCreateIntakeRequestMetadata(c),
    },
  });
  return response.fromResult(c, result, 201);
};

export const createPracticeClientIntakeCheckoutSessionHandler: AppRouteHandler<
  typeof createPracticeClientIntakeCheckoutSessionRoute
> = async (c) => {
  const ctx = getServiceContext(c);
  const { uuid } = c.req.valid('param');
  const result = await intakeCheckoutService.createCheckoutSession(
    {
      uuid,
      origin: c.req.header('origin'),
    },
    ctx,
  );
  return response.fromResult(c, result, 201);
};

export const updatePracticeClientIntakeHandler: AppRouteHandler<typeof updatePracticeClientIntakeRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { uuid } = c.req.valid('param');
  const body = c.req.valid('json');
  const result = await intakeCreationService.updateIntake({ uuid, data: body }, ctx);
  return response.fromResult(c, result);
};

export const getPracticeClientIntakeStatusHandler: AppRouteHandler<
  typeof getPracticeClientIntakeStatusRoute
> = async (c) => {
  const ctx = getServiceContext(c);
  const { uuid } = c.req.valid('param');
  const result = await intakeCheckoutService.getIntakeStatus({ uuid }, ctx);
  return response.fromResult(c, result);
};

export const getPracticeClientIntakePostPayStatusHandler: AppRouteHandler<
  typeof getPracticeClientIntakePostPayStatusRoute
> = async (c) => {
  const { session_id: sessionId } = c.req.valid('query');
  const result = await intakeCheckoutService.getPostPayStatus({ sessionId });
  return response.fromResult(c, result);
};

export const claimPracticeClientIntakeHandler: AppRouteHandler<typeof claimPracticeClientIntakeRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { session_id: sessionId } = c.req.valid('json');
  const result = await intakeCheckoutService.claimIntake({ sessionId }, ctx);
  return response.fromResult(c, result);
};

export const triggerIntakeInvitationHandler: AppRouteHandler<
  typeof triggerIntakeInvitationRoute
> = async (c) => {
  const ctx = getServiceContext(c);
  const { uuid } = c.req.valid('param');
  const result = await intakeLifecycleService.triggerInvitation({ uuid, origin: c.req.header('origin') }, ctx);
  return response.fromResult(c, result);
};

export const listIntakesHandler: AppRouteHandler<typeof listIntakesRoute> = async (c) => {
  // Validate route params (practice_id) even though we use ctx.organizationId
  const { practice_id: _practice_id } = c.req.valid('param');
  const ctx = getServiceContext(c);
  const query = c.req.valid('query');
  const result = await intakeLifecycleService.listIntakes({ query }, ctx);
  return response.fromResult(c, result);
};

export const convertIntakeHandler: AppRouteHandler<typeof convertIntakeRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { uuid } = c.req.valid('param');
  const body = c.req.valid('json');
  const result = await intakeLifecycleService.convertIntake({ uuid, data: body }, ctx);
  return response.fromResult(c, result, 201);
};

export const updateIntakeTriageStatusHandler: AppRouteHandler<typeof updateIntakeTriageStatusRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { uuid } = c.req.valid('param');
  const body = c.req.valid('json');
  const result = await intakeLifecycleService.updateTriageStatus({ uuid, data: body }, ctx);
  return response.fromResult(c, result);
};
