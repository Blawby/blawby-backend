import { z } from '@hono/zod-openapi';
import {
  createMatterTimeEntryRequestSchema,
  updateMatterTimeEntryRequestSchema,
  matterTimeEntryResponseSchema,
  listMatterTimeEntriesQuerySchema,
} from '@/modules/matters/types/matter.types';
import { matterTimeEntriesService } from '@/modules/matters/services/matter-time-entries.service';
import { routeBuilder } from '@/shared/router/route-builder';

const tags = ['Matters'];

export const listTimeEntriesRoute = routeBuilder.build({
  method: 'get',
  path: '/{matter_id}/time-entries',
  tags,
  summary: 'List time entries',
  mcp: {
    name: 'list_time_entries',
    scope: 'matters:read',
    handler: async (args, ctx) => {
      const scopedCtx = { ...ctx, matterId: args.matter_id as string };
      return matterTimeEntriesService.listMatterTimeEntries(
        {
          filters: {
            billable: args.billable as boolean | undefined,
            invoiced: args.invoiced as boolean | undefined,
            startDate: typeof args.start_date === 'string' ? new Date(args.start_date) : undefined,
            endDate: typeof args.end_date === 'string' ? new Date(args.end_date) : undefined,
            entryId: args.entry_id as string | undefined,
          },
        },
        scopedCtx
      );
    },
  },
  request: {
    params: z.object({
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
  mcp: {
    name: 'create_time_entry',
    scope: 'matters:write',
    handler: async (args, ctx) => {
      const { matter_id, ...data } = args;
      const scopedCtx = { ...ctx, matterId: matter_id as string };
      return matterTimeEntriesService.createMatterTimeEntry(
        { data: data as Parameters<typeof matterTimeEntriesService.createMatterTimeEntry>[0]['data'] },
        scopedCtx
      );
    },
  },
  request: {
    params: z.object({
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
  mcp: {
    name: 'update_time_entry',
    scope: 'matters:write',
    handler: async (args, ctx) => {
      const { matter_id, entry_id, ...data } = args;
      const scopedCtx = { ...ctx, matterId: matter_id as string };
      return matterTimeEntriesService.updateMatterTimeEntry(
        {
          entryId: entry_id as string,
          data: data as Parameters<typeof matterTimeEntriesService.updateMatterTimeEntry>[0]['data'],
        },
        scopedCtx
      );
    },
  },
  request: {
    params: z.object({
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
  mcp: {
    name: 'delete_time_entry',
    scope: 'matters:write',
    handler: async (args, ctx) => {
      const scopedCtx = { ...ctx, matterId: args.matter_id as string };
      await matterTimeEntriesService.deleteMatterTimeEntry({ entryId: args.entry_id as string }, scopedCtx);
      return { deleted: true };
    },
  },
  request: {
    params: z.object({
      matter_id: z.uuid(),
      entry_id: z.uuid(),
    }),
  },
  responses: {
    204: {
      description: 'Time entry deleted successfully',
    },
  },
});

export const getTimeEntryStatsRoute = routeBuilder.build({
  method: 'get',
  path: '/{matter_id}/time-entries/stats',
  tags,
  summary: 'Get time entry stats',
  mcp: {
    name: 'get_time_entry_stats',
    scope: 'matters:read',
    handler: async (args, ctx) => {
      const scopedCtx = { ...ctx, matterId: args.matter_id as string };
      return matterTimeEntriesService.getTimeEntryStats(scopedCtx);
    },
  },
  request: {
    params: z.object({
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
