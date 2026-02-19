import {
  createMatterRoute,
  getMattersRoute,
  getMatterRoute,
  updateMatterRoute,
  deleteMatterRoute,
  getMatterActivityRoute,
} from '@/modules/matters/routes';
import { matterActivityService } from '@/modules/matters/services/matter-activity.service';
import { mattersService } from '@/modules/matters/services/matters.service';
import { AppRouteHandler } from '@/shared/types/hono';
import { response } from '@/shared/utils/responseUtils';

export const createMatterHandler: AppRouteHandler<typeof createMatterRoute> = async (c) => {
  const user = c.get('user')!;
  const { practice_id } = c.req.valid('param');
  const validatedBody = c.req.valid('json');

  const result = await mattersService.createMatter(
    practice_id,
    validatedBody,
    user,
    c.req.header(),
  );

  if (result.success) {
    return response.created(c, { matter: result.data });
  }

  return response.fromResult(c, result);
};

export const getMattersHandler: AppRouteHandler<typeof getMattersRoute> = async (c) => {
  const user = c.get('user')!;
  const { practice_id } = c.req.valid('param');
  const query = c.req.valid('query');

  const result = await mattersService.listMatters(practice_id, {
    ...query,
    page: parseInt(String(query.page ?? '1'), 10),
    limit: parseInt(String(query.limit ?? '20'), 10),
  }, user, c.req.header());

  if (!result.success) {
    return response.fromResult(c, result);
  }

  return response.ok(c, {
    matters: result.data.matters,
    total: result.data.total,
    page: parseInt(String(query.page ?? '1'), 10),
    limit: parseInt(String(query.limit ?? '20'), 10),
    totalPages: Math.ceil(result.data.total / parseInt(String(query.limit ?? '20'), 10)),
  });
};

export const getMatterHandler: AppRouteHandler<typeof getMatterRoute> = async (c) => {
  const user = c.get('user')!;
  const { practice_id, id } = c.req.valid('param');

  const result = await mattersService.getMatterById(practice_id, id, user, c.req.header());
  return response.fromResult(c, result);
};

export const updateMatterHandler: AppRouteHandler<typeof updateMatterRoute> = async (c) => {
  const user = c.get('user')!;
  const { practice_id, id } = c.req.valid('param');
  const validatedBody = c.req.valid('json');
  const result = await mattersService.updateMatter(practice_id, id, validatedBody, user, c.req.header());

  if (result.success) {
    return response.ok(c, { matter: result.data });
  }

  return response.fromResult(c, result);
};

export const deleteMatterHandler: AppRouteHandler<typeof deleteMatterRoute> = async (c) => {
  const user = c.get('user')!;
  const { practice_id, id } = c.req.valid('param');
  const result = await mattersService.deleteMatter(practice_id, id, user, c.req.header());
  return response.fromResult(c, result);
};

export const getMatterActivityHandler: AppRouteHandler<typeof getMatterActivityRoute> = async (c) => {
  const user = c.get('user')!;
  const { practice_id, id } = c.req.valid('param');
  const result = await mattersService.getMatterById(practice_id, id, user, c.req.header());
  if (!result.success) {
    return response.fromResult(c, result);
  }
  const activityResult = await matterActivityService.getMatterActivity(id);
  return response.fromResult(c, activityResult);
};
