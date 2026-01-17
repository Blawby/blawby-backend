import { OpenAPIHono } from '@hono/zod-openapi';
import { zValidator } from '@hono/zod-validator';

import { practiceClientIntakesService } from '@/modules/practice-client-intakes/services/practice-client-intakes.service';
import * as routes from '@/modules/practice-client-intakes/routes';
import {
  createPracticeClientIntakeSchema,
  updatePracticeClientIntakeSchema,
  slugParamSchema,
  uuidParamSchema,
} from '@/modules/practice-client-intakes/validations/practice-client-intakes.validation';
import { registerOpenApiRoutes } from '@/shared/router/openapi-docs';
import type { AppContext } from '@/shared/types/hono';
import { response } from '@/shared/utils/responseUtils';

const app = new OpenAPIHono<AppContext>();

// GET /:slug/intake
// Public intake page - returns organization details and payment settings
app.get('/:slug/intake', zValidator('param', slugParamSchema), async (c) => {
  const { slug } = c.req.valid('param');
  const result = await practiceClientIntakesService.getPracticeClientIntakeSettings(slug);

  if (!result.success) {
    return response.notFound(c, result.error || 'Organization not found');
  }

  return response.ok(c, result.data);
});


// POST /create
// Creates payment intent for practice client intake
// Will be mounted at /api/practice/client-intakes/create
app.post('/create', zValidator('json', createPracticeClientIntakeSchema), async (c) => {
  const body = c.req.valid('json');
  const clientIp = c.req.header('x-forwarded-for')
    || c.req.header('cf-connecting-ip')
    || c.req.header('x-real-ip');
  const userAgent = c.req.header('user-agent');

  const result = await practiceClientIntakesService.createPracticeClientIntake({
    ...body,
    clientIp,
    userAgent,
  });

  if (!result.success) {
    return response.badRequest(c, result.error || 'Failed to create payment');
  }

  return response.created(c, result.data);
});


// PUT /:uuid
// Updates payment amount before confirmation
// Will be mounted at /api/practice/client-intakes/:uuid
app.put(
  '/:uuid',
  zValidator('param', uuidParamSchema),
  zValidator('json', updatePracticeClientIntakeSchema),
  async (c) => {
    const { uuid } = c.req.valid('param');
    const { amount } = c.req.valid('json');

    const result = await practiceClientIntakesService.updatePracticeClientIntake(uuid, amount);

    if (!result.success) {
      return response.badRequest(c, result.error || 'Failed to update payment');
    }

    return response.ok(c, result.data);
  },
);


// GET /:uuid/status
// Gets payment status
// Will be mounted at /api/practice/client-intakes/:uuid/status
app.get('/:uuid/status', zValidator('param', uuidParamSchema), async (c) => {
  const { uuid } = c.req.valid('param');
  const result = await practiceClientIntakesService.getPracticeClientIntakeStatus(uuid);

  if (!result.success) {
    return response.notFound(c, result.error || 'Payment not found');
  }

  return response.ok(c, result.data);
});

registerOpenApiRoutes(app, routes);

export default app;
