import { mattersService } from '@/modules/matters/services/matters.service';
import type { MatterListFilters } from '@/modules/matters/types/matter-filters.types';
import {
  createMatterRequestSchema,
  listMattersQuerySchema,
  matterResponseSchema,
  updateMatterRequestSchema,
  type CreateMatterRequest,
  type UpdateMatterRequest,
} from '@/modules/matters/types/matter.types';
import { routeBuilder } from '@/shared/router/route-builder';
import { errorResponseSchema } from '@/shared/validations/openapi';
import { z } from '@hono/zod-openapi';

const tags = ['Matters'];

const mattersSummaryByOriginatingAttorneyItemSchema = z
  .object({
    originating_attorney_id: z.uuid().nullable(),
    total_matters: z.number().int().min(0),
    active_matters: z.number().int().min(0),
    closed_matters: z.number().int().min(0),
  })
  .openapi('MattersSummaryByOriginatingAttorney', {
    description: 'Aggregate matter counts grouped by originating attorney',
  });

export const createMatterRoute = routeBuilder.build({
  method: 'post',
  path: '/{practice_id}',
  tags,
  summary: 'Create a new matter',
  mcp: {
    scope: 'matters:write',
    handler: async (args, ctx) => mattersService.createMatter(args as CreateMatterRequest, ctx),
  },
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

export const listMattersRoute = routeBuilder.build({
  method: 'get',
  path: '/{practice_id}',
  tags,
  summary: 'List matters',
  mcp: {
    scope: 'matters:read',
    handler: async (args, ctx) => mattersService.listMatters(args as MatterListFilters, ctx),
  },
  description: 'Returns a paginated list of matters for the practice.',
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

export const getMatterRoute = routeBuilder.build({
  method: 'get',
  path: '/{practice_id}/{matter_id}',
  tags,
  summary: 'Get a matter',
  mcp: {
    scope: 'matters:read',
    schema: { matter_id: z.uuid() },
    handler: async (args, ctx) => mattersService.getMatterById(args.matter_id as string, ctx),
  },
  description: 'Returns a single matter by ID.',
  request: {
    params: z.object({
      practice_id: z.uuid(),
      matter_id: z.uuid(),
    }),
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

export const updateMatterRoute = routeBuilder.build({
  method: 'put',
  path: '/{practice_id}/{matter_id}',
  tags,
  summary: 'Update a matter',
  mcp: {
    scope: 'matters:write',
    schema: { matter_id: z.uuid(), ...updateMatterRequestSchema.shape },
    handler: async (args, ctx) => {
      const { matter_id, ...data } = args;
      return mattersService.updateMatter(matter_id as string, data as UpdateMatterRequest, ctx);
    },
  },
  request: {
    params: z.object({
      practice_id: z.uuid(),
      matter_id: z.uuid(),
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
  path: '/{practice_id}/{matter_id}',
  tags,
  summary: 'Delete a matter',
  mcp: {
    name: 'delete_matter',
    scope: 'matters:write',
    approval: {
      required: true,
      message: 'Archive this matter? This is a soft delete — the matter and its data remain recoverable.',
    },
    handler: async (args, ctx) => {
      await mattersService.deleteMatter(args.matter_id as string, ctx);
      return { deleted: true };
    },
  },
  request: {
    params: z.object({
      practice_id: z.uuid(),
      matter_id: z.uuid(),
    }),
  },
  responses: {
    204: {
      description: 'Matter deleted successfully',
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

export const getMattersSummaryByOriginatingAttorneyRoute = routeBuilder.build({
  method: 'get',
  path: '/{practice_id}/summary/by-originating-attorney',
  tags,
  summary: 'Matters summary by originating attorney',
  description:
    'Returns aggregate counts of total, active (status <> closed), and closed (status = closed) matters grouped by originating_attorney_id. Excludes soft-deleted matters.',
  request: {
    params: z.object({
      practice_id: z.uuid(),
    }),
  },
  responses: {
    200: {
      description: 'Matters summary retrieved successfully',
      content: {
        'application/json': {
          schema: z.array(mattersSummaryByOriginatingAttorneyItemSchema),
        },
      },
    },
  },
});
