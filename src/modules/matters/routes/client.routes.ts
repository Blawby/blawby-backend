import { z } from '@hono/zod-openapi';
import {
  getActivityLogQuerySchema,
  listMatterNotesQuerySchema,
  listMatterTasksQuerySchema,
  matterNoteResponseSchema,
  matterTaskResponseSchema,
} from '@/modules/matters/types/matter.types';
import { routeBuilder } from '@/shared/router/route-builder';

const tags = ['Client Matters'];

const clientMatterParamsSchema = z.object({
  practice_id: z.uuid(),
  matter_id: z.uuid(),
});

export const getClientMatterActivityRoute = routeBuilder.build({
  method: 'get',
  path: '/{practice_id}/client/{matter_id}/activity',
  tags,
  summary: 'Get client matter activity log',
  request: {
    params: clientMatterParamsSchema,
    query: getActivityLogQuerySchema,
  },
  responses: {
    200: {
      description: 'Activity log retrieved successfully',
      content: {
        'application/json': {
          schema: z.object({
            activities: z.array(z.any()),
          }),
        },
      },
    },
  },
});

export const listClientMatterNotesRoute = routeBuilder.build({
  method: 'get',
  path: '/{practice_id}/client/{matter_id}/notes',
  tags,
  summary: 'List client matter notes',
  request: {
    params: clientMatterParamsSchema,
    query: listMatterNotesQuerySchema,
  },
  responses: {
    200: {
      description: 'Notes retrieved successfully',
      content: {
        'application/json': {
          schema: z.array(matterNoteResponseSchema),
        },
      },
    },
  },
});

export const listClientMatterTasksRoute = routeBuilder.build({
  method: 'get',
  path: '/{practice_id}/client/{matter_id}/tasks',
  tags,
  summary: 'List client matter tasks',
  request: {
    params: clientMatterParamsSchema,
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
