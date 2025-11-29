import { OpenAPIHono } from '@hono/zod-openapi';

import {
  createPracticeRoute,
  deletePracticeRoute,
  getPracticeByIdRoute,
  listPracticesRoute,
  setActivePracticeRoute,
  updatePracticeRoute,
} from '@/modules/practice/routes';
import {
  listPractices,
  getPracticeById,
  createPracticeService,
  updatePracticeService,
  deletePracticeService,
  setActivePractice,
} from '@/modules/practice/services/practice.service';
import {
  practiceIdParamSchema,
  createPracticeSchema,
  updatePracticeSchema,
} from '@/modules/practice/validations/practice.validation';
import { validateParams, validateJson, validateParamsAndJson } from '@/shared/middleware/validation';
import type { AppContext } from '@/shared/types/hono';
import { response } from '@/shared/utils/responseUtils';

const practiceApp = new OpenAPIHono<AppContext>();

/**
 * GET /api/practice/list
 * List all practices for the authenticated user
 */
practiceApp.get('/list', async (c) => {
  const user = c.get('user')!; // Auth middleware guarantees user is non-null
  const practices = await listPractices(user, c.req.header() as Record<string, string>);
  return response.ok(c, { practices });
});

// Register OpenAPI route for documentation only
practiceApp.openapi(listPracticesRoute, async () => {
  throw new Error('This should never be called');
});

/**
 * POST /api/practice
 * Create a new practice
 */
practiceApp.post('/', validateJson(createPracticeSchema, 'Invalid Practice Data'), async (c) => {
  const user = c.get('user')!; // Auth middleware guarantees user is non-null
  const validatedBody = c.get('validatedBody');

  const practice = await createPracticeService({
    data: validatedBody,
    user,
    requestHeaders: c.req.header() as Record<string, string>,
  });
  return response.created(c, { practice });
});

// Register OpenAPI route for documentation only
practiceApp.openapi(createPracticeRoute, async () => {
  throw new Error('This should never be called');
});

/**
 * GET /api/practice/:uuid
 * Get practice by ID
 */
practiceApp.get('/:uuid', validateParams(practiceIdParamSchema, 'Invalid Practice uuid'), async (c) => {
  const user = c.get('user')!; // Auth middleware guarantees user is non-null
  const validatedParams = c.get('validatedParams');

  const practice = await getPracticeById(validatedParams.uuid,
    user,
    c.req.header() as Record<string, string>);
  return response.ok(c, { practice });
});

// Register OpenAPI route for documentation only
practiceApp.openapi(getPracticeByIdRoute, async () => {
  throw new Error('This should never be called');
});

/**
 * PUT /api/practice/:uuid
 * Update practice
 */
practiceApp.put('/:uuid', validateParamsAndJson(
  practiceIdParamSchema,
  updatePracticeSchema,
  'Invalid Practice ID',
  'Invalid Practice Data',
), async (c) => {
  const user = c.get('user')!; // Auth middleware guarantees user is non-null
  const validatedParams = c.get('validatedParams');
  const validatedBody = c.get('validatedBody');

  const practice = await updatePracticeService(
    validatedParams.uuid,
    validatedBody,
    user,
    c.req.header() as Record<string, string>,
  );
  return response.ok(c, { practice });
});

// Register OpenAPI route for documentation only
practiceApp.openapi(updatePracticeRoute, async () => {
  throw new Error('This should never be called');
});

/**
 * DELETE /api/practice/:uuid
 * Delete practice
 */
practiceApp.delete('/:uuid', validateParams(practiceIdParamSchema, 'Invalid Practice ID'), async (c) => {
  const user = c.get('user')!; // Auth middleware guarantees user is non-null
  const validatedParams = c.get('validatedParams');

  await deletePracticeService(validatedParams.uuid,
    user,
    c.req.header() as Record<string, string>);
  return response.noContent(c);
});

// Register OpenAPI route for documentation only
practiceApp.openapi(deletePracticeRoute, async () => {
  throw new Error('This should never be called');
});

/**
 * PUT /api/practice/:uuid/active
 * Set practice as active
 */
practiceApp.put('/:uuid/active', validateParams(practiceIdParamSchema, 'Invalid Practice ID'), async (c) => {
  const user = c.get('user')!; // Auth middleware guarantees user is non-null
  const validatedParams = c.get('validatedParams');

  const result = await setActivePractice(validatedParams.uuid,
    user,
    c.req.header() as Record<string, string>);
  return response.ok(c, { result });
});

// Register OpenAPI route for documentation only
practiceApp.openapi(setActivePracticeRoute, async () => {
  throw new Error('This should never be called');
});

export default practiceApp;
