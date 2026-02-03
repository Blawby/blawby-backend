import { OpenAPIHono } from '@hono/zod-openapi';
import { zValidator } from '@hono/zod-validator';
import * as routes from '@/modules/practice-client-intakes/routes';
import { practiceClientIntakesService } from '@/modules/practice-client-intakes/services/practice-client-intakes.service';
import {
  intakeValidations,
} from '@/modules/practice-client-intakes/validations/practice-client-intakes.validation';
import { createBetterAuthInstance } from '@/shared/auth/better-auth';
import { db } from '@/shared/database';
import { registerOpenApiRoutes } from '@/shared/router/openapi-docs';
import type { AppContext, AppRouteHandler } from '@/shared/types/hono';
import { response } from '@/shared/utils/responseUtils';

const app = new OpenAPIHono<AppContext>();

const getOptionalSessionUserId = async (c: AppContext): Promise<string | undefined> => {
  const existingUserId = c.get('userId');
  if (existingUserId) {
    return existingUserId;
  }

  try {
    const auth = createBetterAuthInstance(db);
    const session = await auth.api.getSession({
      headers: c.req.raw.headers,
    });
    return session?.user?.id ?? undefined;
  } catch {
    return undefined;
  }
};

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
  const sessionUserId = await getOptionalSessionUserId(c);

  const result = await practiceClientIntakesService.createPracticeClientIntake({
    ...body,
    // Override any user_id from request body with session user_id
    user_id: sessionUserId ?? undefined,
    clientIp,
    userAgent,
  });

  return response.fromResult(c, result, 201);
});

// POST /:uuid/checkout-session
// Creates Stripe Checkout Session for existing intake
app.post(
  '/:uuid/checkout-session',
  zValidator('param', intakeValidations.uuidParamSchema),
  async (c) => {
    const { uuid } = c.req.valid('param');
    const sessionUserId = await getOptionalSessionUserId(c);
    const result = await practiceClientIntakesService.createPracticeClientIntakeCheckoutSession({
      uuid,
      user_id: sessionUserId,
    });
    return response.fromResult(c, result, 201);
  },
);


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

// GET /post-pay/status
app.get(
  '/post-pay/status',
  zValidator('query', intakeValidations.checkoutSessionStatusQuerySchema),
  async (c) => {
    const { session_id } = c.req.valid('query');
    const result = await practiceClientIntakesService.getPracticeClientIntakePostPayStatus(session_id);
    return response.fromResult(c, result);
  },
);

// POST /claim
app.post(
  '/claim',
  zValidator('json', intakeValidations.claimPracticeClientIntakeSchema),
  async (c) => {
    const { session_id } = c.req.valid('json');
    const sessionUserId = c.get('userId');

    if (!sessionUserId) {
      return response.unauthorized(c, 'Authentication required to claim intake');
    }

    const result = await practiceClientIntakesService.claimPracticeClientIntakePayment({
      session_id,
      user_id: sessionUserId,
    });
    return response.fromResult(c, result);
  },
);

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
