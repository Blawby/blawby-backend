import { z } from '@hono/zod-openapi';
import {
  createMatterTaskRequestSchema,
  updateMatterTaskRequestSchema,
  matterTaskResponseSchema,
  listMatterTasksQuerySchema,
} from '@/modules/matters/types/matter.types';
import { matterTaskValidations } from '@/modules/matters/validations/matter-tasks.validation';
import { routeBuilder } from '@/shared/router/route-builder';
import { uuidValidator, paginationSchema as paginationQuerySchema } from '@/shared/validations/common';
import { paginationSchema as paginationResponseSchema } from '@/shared/validations/openapi';

const tags = ['Matters'];

const matterIdParamSchema = z.object({
  matter_id: z.uuid(),
});

const taskIdParamSchema = z.object({
  task_id: z.uuid(),
});

const practiceIdOnlyParamSchema = z.object({
  practice_id: z.uuid(),
});

const listOrganizationTasksQuerySchema = z.object({
  assignee_id: uuidValidator.optional(),
  status: matterTaskValidations.taskStatusEnum.optional(),
  due_before: z.iso.date().optional(),
  ...paginationQuerySchema.shape,
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

export const listOrganizationTasksRoute = routeBuilder.build({
  method: 'get',
  path: '/{practice_id}/tasks',
  tags,
  summary: 'List tasks across the organization',
  description:
    'Returns tasks across the organization, joined to matters for org scoping. Supports filtering by assignee_id, status, and due_before. due_before semantics: due_date < due_before (excludes tasks with NULL due_date). Ordered by created_at DESC.',
  request: {
    params: practiceIdOnlyParamSchema,
    query: listOrganizationTasksQuerySchema,
  },
  responses: {
    200: {
      description: 'Organization-wide tasks retrieved successfully',
      content: {
        'application/json': {
          schema: z.object({
            data: z.array(matterTaskResponseSchema),
            pagination: paginationResponseSchema,
          }),
        },
      },
    },
  },
});
