import { z } from '@hono/zod-openapi';
import {
  activityLogResponseSchema,
  clientMatterResponseSchema,
  listClientMattersQuerySchema,
  listMatterNotesQuerySchema,
  listMatterTasksQuerySchema,
  matterNoteResponseSchema,
  matterTaskResponseSchema,
} from '@/modules/matters/types/matter.types';
import { routeBuilder } from '@/shared/router/route-builder';
import { paginationSchema as paginationQuerySchema, uuidValidator } from '@/shared/validations/common';
import { errorResponseSchema, paginationSchema, practiceIdParamSchema } from '@/shared/validations/openapi';

const tags = ['Client Matters'];

const clientMatterParamsSchema = practiceIdParamSchema.extend({
  matter_id: z.uuid(),
});

const clientMatterActivityQuerySchema = z.object({
  activity_id: uuidValidator.optional(),
  ...paginationQuerySchema.shape,
});
const clientMatterNotesQuerySchema = listMatterNotesQuerySchema.extend(paginationQuerySchema.shape);
const clientMatterTasksQuerySchema = listMatterTasksQuerySchema.extend(paginationQuerySchema.shape);

const listClientMattersRoute = routeBuilder.build({
  method: 'get',
  path: '/{practice_id}/client',
  tags,
  summary: 'List client matters',
  description: 'Returns a paginated list of matters for the authenticated client.',
  request: {
    params: practiceIdParamSchema,
    query: listClientMattersQuerySchema,
  },
  responses: {
    200: {
      description: 'Matters retrieved successfully',
      content: {
        'application/json': {
          schema: z.object({
            data: z.array(clientMatterResponseSchema),
            pagination: paginationSchema,
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
            matter: clientMatterResponseSchema,
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
    query: clientMatterActivityQuerySchema,
  },
  responses: {
    200: {
      description: 'Activity log retrieved successfully',
      content: {
        'application/json': {
          schema: z.object({
            data: z.array(activityLogResponseSchema),
            pagination: paginationSchema,
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
    query: clientMatterNotesQuerySchema,
  },
  responses: {
    200: {
      description: 'Notes retrieved successfully',
      content: {
        'application/json': {
          schema: z.object({
            data: z.array(matterNoteResponseSchema),
            pagination: paginationSchema,
          }),
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
    query: clientMatterTasksQuerySchema,
  },
  responses: {
    200: {
      description: 'Tasks retrieved successfully',
      content: {
        'application/json': {
          schema: z.object({
            data: z.array(matterTaskResponseSchema),
            pagination: paginationSchema,
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
