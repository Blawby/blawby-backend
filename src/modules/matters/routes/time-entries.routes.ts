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
  path: '/{matter_id}/time-entries',
  tags,
  summary: 'List time entries',
  request: {
    params: z.object({
      practice_id: z.uuid(),
      matter_id: z.uuid(),
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
  path: '/{matter_id}/time-entries',
  tags,
  summary: 'Create a time entry',
  request: {
    params: z.object({
      practice_id: z.uuid(),
      matter_id: z.uuid(),
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
  path: '/{matter_id}/time-entries/{entry_id}',
  tags,
  summary: 'Update a time entry',
  request: {
    params: z.object({
      practice_id: z.uuid(),
      matter_id: z.uuid(),
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
  path: '/{matter_id}/time-entries/{entry_id}',
  tags,
  summary: 'Delete a time entry',
  request: {
    params: z.object({
      practice_id: z.uuid(),
      matter_id: z.uuid(),
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
  path: '/{matter_id}/time-entries/stats',
  tags,
  summary: 'Get time entry stats',
  request: {
    params: z.object({
      practice_id: z.uuid(),
      matter_id: z.uuid(),
    }),
  },
  responses: {
    200: {
      description: 'Time entry stats retrieved successfully',
      content: {
        'application/json': {
          schema: z.object({
            total_time: z.number().openapi({
              description: 'Total logged time in minutes',
              example: 120,
            }),
            billable_time: z.number().openapi({
              description: 'Total billable time in minutes',
              example: 90,
            }),
          }),
        },
      },
    },
  },
});
