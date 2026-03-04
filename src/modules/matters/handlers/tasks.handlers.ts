import {
  listMatterTasksRoute,
  createMatterTaskRoute,
  updateMatterTaskRoute,
  deleteMatterTaskRoute,
  generateMatterTasksRoute,
} from '@/modules/matters/routes';
import { matterTasksService } from '@/modules/matters/services/matter-tasks.service';
import { AppRouteHandler } from '@/shared/types/hono';
import { response } from '@/shared/utils/responseUtils';

export const listMatterTasksHandler: AppRouteHandler<typeof listMatterTasksRoute> = async (c) => {
  const user = c.get('user')!;
  const { practice_id, id } = c.req.valid('param');
  const query = c.req.valid('query');
  const result = await matterTasksService.listMatterTasks(practice_id, id, user, c.req.header(), {
    taskId: query.task_id,
    assigneeId: query.assignee_id,
    status: query.status,
    priority: query.priority,
    stage: query.stage,
  });

  if (!result.success) {
    return response.fromResult(c, result);
  }

  return response.ok(c, { tasks: result.data });
};

export const createMatterTaskHandler: AppRouteHandler<typeof createMatterTaskRoute> = async (c) => {
  const user = c.get('user')!;
  const { practice_id, id } = c.req.valid('param');
  const validatedBody = c.req.valid('json');
  const result = await matterTasksService.createMatterTask(practice_id, id, validatedBody, user, c.req.header());

  if (!result.success) {
    return response.fromResult(c, result);
  }

  return response.created(c, { task: result.data });
};

export const updateMatterTaskHandler: AppRouteHandler<typeof updateMatterTaskRoute> = async (c) => {
  const user = c.get('user')!;
  const { practice_id, id, task_id } = c.req.valid('param');
  const validatedBody = c.req.valid('json');
  const result = await matterTasksService.updateMatterTask(
    practice_id,
    id,
    task_id,
    validatedBody,
    user,
    c.req.header(),
  );

  if (!result.success) {
    return response.fromResult(c, result);
  }

  return response.ok(c, { task: result.data });
};

export const deleteMatterTaskHandler: AppRouteHandler<typeof deleteMatterTaskRoute> = async (c) => {
  const user = c.get('user')!;
  const { practice_id, id, task_id } = c.req.valid('param');
  const result = await matterTasksService.deleteMatterTask(practice_id, id, task_id, user, c.req.header());
  return response.fromResult(c, result);
};

export const generateMatterTasksHandler: AppRouteHandler<typeof generateMatterTasksRoute> = async (c) => {
  const user = c.get('user')!;
  const { practice_id, id } = c.req.valid('param');
  const validatedBody = c.req.valid('json');
  const result = await matterTasksService.generateMatterTasksFromTemplate(
    practice_id,
    id,
    validatedBody,
    user,
    c.req.header(),
  );

  if (!result.success) {
    return response.fromResult(c, result);
  }

  return response.created(c, { tasks: result.data });
};
