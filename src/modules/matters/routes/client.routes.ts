import { z } from '@hono/zod-openapi';
import {
  activityLogResponseSchema,
  getActivityLogQuerySchema,
  listClientMattersQuerySchema,
  listMatterNotesQuerySchema,
  listMatterTasksQuerySchema,
  matterNoteResponseSchema,
  matterResponseSchema,
  matterTaskResponseSchema,
} from '@/modules/matters/types/matter.types';
import { routeBuilder } from '@/shared/router/route-builder';
import { errorResponseSchema } from '@/shared/validations/openapi';

const tags = ['Client Matters'];

const clientMatterParamsSchema = z.object({
  practice_id: z.uuid(),
  matter_id: z.uuid(),
});

const listClientMattersRoute = routeBuilder.build({
  method: 'get',
  path: '/{practice_id}/client',
  tags,
  summary: 'List client matters',
  description: 'Returns a paginated list of matters for the authenticated client.',
  request: {
    params: z.object({
      practice_id: z.uuid(),
    }),
    query: listClientMattersQuerySchema,
  },
  responses: {
    200: {
      description: 'Matters retrieved successfully',
      content: {
        'application/json': {
          schema: z.object({
            matters: z.array(matterResponseSchema),
            total: z.number(),
            page: z.number(),
            limit: z.number(),
            totalPages: z.number(),
          }),
        },
      },
    },
  },
});

const getClientMatterRoute = routeBuilder.build({
  method: 'get',
  path: '/{practice_id}/client/{matter_id}',
  tags,
  summary: 'Get a client matter',
  description: 'Returns a single matter owned by the authenticated client.',
  request: {
    params: clientMatterParamsSchema,
  },
  responses: {
    200: {
      description: 'Matter retrieved successfully',
      content: {
        'application/json': {
          schema: z.object({
            matter: matterResponseSchema,
          }),
        },
      },
    },
    404: {
      description: 'Matter not found',
      content: {
        'application/json': {
          schema: errorResponseSchema,
        },
      },
    },
  },
});

const getClientMatterActivityRoute = routeBuilder.build({
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
            activities: z.array(activityLogResponseSchema),
          }),
        },
      },
    },
  },
});

const listClientMatterNotesRoute = routeBuilder.build({
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

const listClientMatterTasksRoute = routeBuilder.build({
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

export const clientMatterRoutes = {
  listClientMattersRoute,
  getClientMatterRoute,
  getClientMatterActivityRoute,
  listClientMatterNotesRoute,
  listClientMatterTasksRoute,
};
