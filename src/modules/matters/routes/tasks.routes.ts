import { z } from '@hono/zod-openapi';
import {
  createMatterTaskRequestSchema,
  updateMatterTaskRequestSchema,
  matterTaskResponseSchema,
  listMatterTasksQuerySchema,
} from '@/modules/matters/types/matter.types';
import { routeBuilder } from '@/shared/router/route-builder';

const tags = ['Matters'];

const matterIdParamSchema = z.object({
  matter_id: z.uuid(),
});

const taskIdParamSchema = z.object({
  task_id: z.uuid(),
});

export const listMatterTasksRoute = routeBuilder.build({
  method: 'get',
  path: '/{matter_id}/tasks',
  tags,
  summary: 'List matter tasks',
  request: {
    params: matterIdParamSchema,
    query: listMatterTasksQuerySchema,
  },
  responses: {
    200: {
      description: 'Tasks retrieved successfully',
      content: {
        'application/json': {
          schema: z.object({
            tasks: z.array(matterTaskResponseSchema),
          }),
        },
      },
    },
  },
});

export const createMatterTaskRoute = routeBuilder.build({
  method: 'post',
  path: '/{matter_id}/tasks',
  tags,
  summary: 'Create a matter task',
  request: {
    params: matterIdParamSchema,
    body: {
      content: {
        'application/json': {
          schema: createMatterTaskRequestSchema,
        },
      },
    },
  },
  responses: {
    201: {
      description: 'Task created successfully',
      content: {
        'application/json': {
          schema: matterTaskResponseSchema,
        },
      },
    },
  },
});

export const updateMatterTaskRoute = routeBuilder.build({
  method: 'put',
  path: '/{matter_id}/tasks/{task_id}',
  tags,
  summary: 'Update a matter task',
  request: {
    params: matterIdParamSchema.merge(taskIdParamSchema),
    body: {
      content: {
        'application/json': {
          schema: updateMatterTaskRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Task updated successfully',
      content: {
        'application/json': {
          schema: matterTaskResponseSchema,
        },
      },
    },
  },
});

export const deleteMatterTaskRoute = routeBuilder.build({
  method: 'delete',
  path: '/{matter_id}/tasks/{task_id}',
  tags,
  summary: 'Delete a matter task',
  request: {
    params: matterIdParamSchema.merge(taskIdParamSchema),
  },
  responses: {
    204: {
      description: 'Task deleted successfully',
    },
  },
});
