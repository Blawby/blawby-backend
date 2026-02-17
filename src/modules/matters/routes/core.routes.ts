import { z } from '@hono/zod-openapi';
import {
  createMatterRequestSchema,
  updateMatterRequestSchema,
  listMattersQuerySchema,
  matterResponseSchema,
} from '@/modules/matters/types/matter.types';
import { routeBuilder } from '@/shared/router/route-builder';
import {
  errorResponseSchema,
} from '@/shared/validations/openapi';

const tags = ['Matters'];

export const createMatterRoute = routeBuilder.build({
  method: 'post',
  path: '/{practice_id}/matters',
  tags,
  summary: 'Create a new matter',
  request: {
    params: z.object({
      practice_id: z.uuid(),
    }),
    body: {
      content: {
        'application/json': {
          schema: createMatterRequestSchema,
        },
      },
    },
  },
  responses: {
    201: {
      description: 'Matter created successfully',
      content: {
        'application/json': {
          schema: z.object({
            matter: matterResponseSchema,
          }),
        },
      },
    },
  },
});

export const getMattersRoute = routeBuilder.build({
  method: 'get',
  path: '/{practice_id}/matters',
  tags,
  summary: 'List matters',
  request: {
    params: z.object({
      practice_id: z.uuid(),
    }),
    query: listMattersQuerySchema,
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

export const updateMatterRoute = routeBuilder.build({
  method: 'put',
  path: '/{practice_id}/matters/{id}',
  tags,
  summary: 'Update a matter',
  request: {
    params: z.object({
      practice_id: z.uuid(),
      id: z.uuid(),
    }),
    body: {
      content: {
        'application/json': {
          schema: updateMatterRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Matter updated successfully',
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

export const deleteMatterRoute = routeBuilder.build({
  method: 'delete',
  path: '/{practice_id}/matters/{id}',
  tags,
  summary: 'Delete a matter',
  request: {
    params: z.object({
      practice_id: z.uuid(),
      id: z.uuid(),
    }),
  },
  responses: {
    200: {
      description: 'Matter deleted successfully',
      content: {
        'application/json': {
          schema: z.object({
            success: z.boolean(),
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
