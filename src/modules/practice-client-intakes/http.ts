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

app.get('/:slug/intake', zValidator('param', slugParamSchema), async (c) => {
  const { slug } = c.req.valid('param');
  const result = await practiceClientIntakesService.getPracticeClientIntakeSettings(slug);
  return response.fromResult(c, result);
});


// POST /create
// Creates payment intent for practice client intake
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

  return response.fromResult(c, result, 201);
});


// PUT /:uuid
app.put(
  '/:uuid',
  zValidator('param', uuidParamSchema),
  zValidator('json', updatePracticeClientIntakeSchema),
  async (c) => {
    const { uuid } = c.req.valid('param');
    const { amount } = c.req.valid('json');

    const result = await practiceClientIntakesService.updatePracticeClientIntake(uuid, amount);
    return response.fromResult(c, result);
  },
);


// GET /:uuid/status
app.get('/:uuid/status', zValidator('param', uuidParamSchema), async (c) => {
  const { uuid } = c.req.valid('param');
  const result = await practiceClientIntakesService.getPracticeClientIntakeStatus(uuid);
  return response.fromResult(c, result);
});

registerOpenApiRoutes(app, routes);

export default app;
