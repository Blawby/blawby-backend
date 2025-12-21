import { OpenAPIHono } from '@hono/zod-openapi';
import { zValidator } from '@hono/zod-validator';

import { createPracticeClientIntakesService } from './services/practice-client-intakes.service';
import * as routes from './routes';
import {
  createPracticeClientIntakeSchema,
  updatePracticeClientIntakeSchema,
  slugParamSchema,
  uuidParamSchema,
} from './validations/practice-client-intakes.validation';
import type { AppContext } from '@/shared/types/hono';
import { response } from '@/shared/utils/responseUtils';

const app = new OpenAPIHono<AppContext>();

// Initialize service
const practiceClientIntakesService = createPracticeClientIntakesService();

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

// Register OpenAPI route for documentation
app.openapi(routes.getIntakeSettingsRoute, async () => {
  throw new Error('This should never be called');
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

// Register OpenAPI route for documentation
app.openapi(routes.createPracticeClientIntakeRoute, async () => {
  throw new Error('This should never be called');
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

// Register OpenAPI route for documentation
app.openapi(routes.updatePracticeClientIntakeRoute, async () => {
  throw new Error('This should never be called');
});

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

// Register OpenAPI route for documentation
app.openapi(routes.getPracticeClientIntakeStatusRoute, async () => {
  throw new Error('This should never be called');
});

export default app;
