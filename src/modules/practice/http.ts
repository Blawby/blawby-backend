import { Hono } from 'hono';
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

const practiceApp = new Hono<AppContext>();

// GET /api/practice/list
practiceApp.get('/list', async (c) => {
  const user = c.get('user')!; // Auth middleware guarantees user is non-null
  const practices = await listPractices(user, c.req.header() as Record<string, string>);
  return response.ok(c, { practices });
});


// POST /api/practice
practiceApp.post('/',
  validateJson(createPracticeSchema, 'Invalid Practice Data'),
  async (c) => {
    const user = c.get('user')!; // Auth middleware guarantees user is non-null
    const validatedBody = c.get('validatedBody');

    const practice = await createPracticeService({
      data: validatedBody,
      user,
      requestHeaders: c.req.header() as Record<string, string>,
    });
    return response.created(c, { practice });
  });

// GET /api/practice/:id
practiceApp.get('/:uuid',
  validateParams(practiceIdParamSchema, 'Invalid Practice uuid'),
  async (c) => {
    const user = c.get('user')!; // Auth middleware guarantees user is non-null
    const validatedParams = c.get('validatedParams');

    const practice = await getPracticeById(validatedParams.uuid,
      user,
      c.req.header() as Record<string, string>);
    return response.ok(c, { practice });
  });

// PUT /api/practice/:id
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

// DELETE /api/practice/:id
practiceApp.delete('/:uuid',
  validateParams(practiceIdParamSchema, 'Invalid Practice ID'),
  async (c) => {
    const user = c.get('user')!; // Auth middleware guarantees user is non-null
    const validatedParams = c.get('validatedParams');

    await deletePracticeService(validatedParams.uuid,
      user,
      c.req.header() as Record<string, string>);
    return response.noContent(c);
  });

// PUT /api/practice/:id/active
practiceApp.put('/:uuid/active',
  validateParams(practiceIdParamSchema, 'Invalid Practice ID'),
  async (c) => {
    const user = c.get('user')!; // Auth middleware guarantees user is non-null
    const validatedParams = c.get('validatedParams');

    const result = await setActivePractice(validatedParams.uuid,
      user,
      c.req.header() as Record<string, string>);
    return response.ok(c, { result });
  });

export default practiceApp;
