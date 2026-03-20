import { z } from '@hono/zod-openapi';
import {
  createMatterTimeEntryRequestSchema,
  updateMatterTimeEntryRequestSchema,
  matterTimeEntryResponseSchema,
  listMatterTimeEntriesQuerySchema,
} from '@/modules/matters/types/matter.types';
import { routeBuilder } from '@/shared/router/route-builder';

const tags = ['Matters'];

export const listTimeEntriesRoute = routeBuilder.build({
  method: 'get',
  path: '/{id}/time-entries',
  tags,
  summary: 'List time entries',
  request: {
    params: z.object({
      id: z.uuid(),
    }),
    query: listMatterTimeEntriesQuerySchema,
  },
  responses: {
    200: {
      description: 'Time entries retrieved successfully',
      content: {
        'application/json': {
          schema: z.array(matterTimeEntryResponseSchema),
        },
      },
    },
  },
});

export const createTimeEntryRoute = routeBuilder.build({
  method: 'post',
  path: '/{id}/time-entries',
  tags,
  summary: 'Create a time entry',
  request: {
    params: z.object({
      id: z.uuid(),
    }),
    body: {
      content: {
        'application/json': {
          schema: createMatterTimeEntryRequestSchema,
        },
      },
    },
  },
  responses: {
    201: {
      description: 'Time entry created successfully',
      content: {
        'application/json': {
          schema: matterTimeEntryResponseSchema,
        },
      },
    },
  },
});

export const updateTimeEntryRoute = routeBuilder.build({
  method: 'put',
  path: '/{id}/time-entries/{entry_id}',
  tags,
  summary: 'Update a time entry',
  request: {
    params: z.object({
      id: z.uuid(),
      entry_id: z.uuid(),
    }),
    body: {
      content: {
        'application/json': {
          schema: updateMatterTimeEntryRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Time entry updated successfully',
      content: {
        'application/json': {
          schema: matterTimeEntryResponseSchema,
        },
      },
    },
  },
});

export const deleteTimeEntryRoute = routeBuilder.build({
  method: 'delete',
  path: '/{id}/time-entries/{entry_id}',
  tags,
  summary: 'Delete a time entry',
  request: {
    params: z.object({
      id: z.uuid(),
      entry_id: z.uuid(),
    }),
  },
  responses: {
    200: {
      description: 'Time entry deleted successfully',
      content: {
        'application/json': {
          schema: z.object({
            success: z.boolean(),
          }),
        },
      },
    },
  },
});

export const getTimeEntryStatsRoute = routeBuilder.build({
  method: 'get',
  path: '/{id}/time-entries',
  tags,
  summary: 'Get time entry',
  request: {
    params: z.object({
      id: z.uuid(),
    }),
  },
  responses: {
    200: {
      description: 'Time stats retrieved successfully',
      content: {
        'application/json': {
          schema: z.object({
            total_time: z.number(), // Minutes? or milliseconds?
            billable_time: z.number(),
          }),
        },
      },
    },
  },
});
