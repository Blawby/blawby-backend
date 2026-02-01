import { OpenAPIHono } from '@hono/zod-openapi';
import { zValidator } from '@hono/zod-validator';
import * as routes from '@/modules/practice-client-intakes/routes';
import { practiceClientIntakesService } from '@/modules/practice-client-intakes/services/practice-client-intakes.service';
import {
  intakeValidations,
} from '@/modules/practice-client-intakes/validations/practice-client-intakes.validation';
import { registerOpenApiRoutes } from '@/shared/router/openapi-docs';
import type { AppContext, AppRouteHandler } from '@/shared/types/hono';
import { response } from '@/shared/utils/responseUtils';

const app = new OpenAPIHono<AppContext>();


// GET /:slug/intake
// Public intake page - returns organization details and payment settings
app.get('/:slug/intake', zValidator('param', intakeValidations.slugParamSchema), async (c) => {
  const { slug } = c.req.valid('param');
  const result = await practiceClientIntakesService.getPracticeClientIntakeSettings(slug);
  return response.fromResult(c, result);
});


// POST /create
// Creates payment intent for practice client intake
// Will be mounted at /api/practice/client-intakes/create
app.post('/create', zValidator('json', intakeValidations.createPracticeClientIntakeSchema), async (c) => {
  const body = c.req.valid('json');
  const clientIp = c.req.header('x-forwarded-for')
    || c.req.header('cf-connecting-ip')
    || c.req.header('x-real-ip');
  const userAgent = c.req.header('user-agent');

  // Get user_id from authenticated session context (if available)
  // Never trust user_id from request body to prevent spoofing
  const sessionUserId = c.get('userId');

  const result = await practiceClientIntakesService.createPracticeClientIntake({
    ...body,
    // Override any user_id from request body with session user_id
    user_id: sessionUserId ?? undefined,
    clientIp,
    userAgent,
  });

  return response.fromResult(c, result, 201);
});


// PUT /:uuid
app.put(
  '/:uuid',
  zValidator('param', intakeValidations.uuidParamSchema),
  zValidator('json', intakeValidations.updatePracticeClientIntakeSchema),
  async (c) => {
    const { uuid } = c.req.valid('param');
    const { amount } = c.req.valid('json');

    const result = await practiceClientIntakesService.updatePracticeClientIntake(uuid, amount);
    return response.fromResult(c, result);
  },
);


// GET /:uuid/status
// Gets payment status
// Will be mounted at /api/practice/client-intakes/:uuid/status
app.get('/:uuid/status', zValidator('param', intakeValidations.uuidParamSchema), async (c) => {
  const { uuid } = c.req.valid('param');
  const result = await practiceClientIntakesService.getPracticeClientIntakeStatus(uuid);
  return response.fromResult(c, result);
});


// POST /:uuid/invite
// Triggers an invitation for the user associated with this intake
const triggerIntakeInvitationHandler: AppRouteHandler<typeof routes.triggerIntakeInvitationRoute> = async (c) => {
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

app.openapi(routes.triggerIntakeInvitationRoute, triggerIntakeInvitationHandler);

registerOpenApiRoutes(app, routes);

export default app;
