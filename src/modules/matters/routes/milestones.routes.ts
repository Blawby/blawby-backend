import { z } from '@hono/zod-openapi';
import {
  createMatterMilestoneRequestSchema,
  updateMatterMilestoneRequestSchema,
  matterMilestoneResponseSchema,
  listMatterMilestonesQuerySchema,
  reorderMatterMilestonesRequestSchema,
} from '@/modules/matters/types/matter.types';
import { matterMilestonesService } from '@/modules/matters/services/matter-milestones.service';
import { routeBuilder } from '@/shared/router/route-builder';

const tags = ['Matters'];

export const listMilestonesRoute = routeBuilder.build({
  method: 'get',
  path: '/{matter_id}/milestones',
  tags,
  summary: 'List milestones',
  mcp: {
    name: 'list_milestones',
    scope: 'matters:read',
    handler: async (args, ctx) => {
      const scopedCtx = { ...ctx, matterId: args.matter_id as string };
      return matterMilestonesService.listMatterMilestones(
        { filters: { milestoneId: args.milestone_id as string | undefined } },
        scopedCtx
      );
    },
  },
  request: {
    params: z.object({
      matter_id: z.uuid(),
    }),
    query: listMatterMilestonesQuerySchema,
  },
  responses: {
    200: {
      description: 'Milestones retrieved successfully',
      content: {
        'application/json': {
          schema: z.array(matterMilestoneResponseSchema),
        },
      },
    },
  },
});

export const createMilestoneRoute = routeBuilder.build({
  method: 'post',
  path: '/{matter_id}/milestones',
  tags,
  summary: 'Create a milestone',
  mcp: {
    name: 'create_milestone',
    scope: 'matters:write',
    handler: async (args, ctx) => {
      const { matter_id, ...data } = args;
      const scopedCtx = { ...ctx, matterId: matter_id as string };
      const milestoneData = data as Parameters<typeof matterMilestonesService.createMatterMilestone>[0]['data'];
      return matterMilestonesService.createMatterMilestone(
        { data: { ...milestoneData, order: milestoneData.order ?? 0 } },
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
          schema: createMatterMilestoneRequestSchema,
        },
      },
    },
  },
  responses: {
    201: {
      description: 'Milestone created successfully',
      content: {
        'application/json': {
          schema: matterMilestoneResponseSchema,
        },
      },
    },
  },
});

export const updateMilestoneRoute = routeBuilder.build({
  method: 'put',
  path: '/{matter_id}/milestones/{milestone_id}',
  tags,
  summary: 'Update a milestone',
  mcp: {
    name: 'update_milestone',
    scope: 'matters:write',
    handler: async (args, ctx) => {
      const { matter_id, milestone_id, ...data } = args;
      const scopedCtx = { ...ctx, matterId: matter_id as string };
      return matterMilestonesService.updateMatterMilestone(
        {
          milestoneId: milestone_id as string,
          data: data as Parameters<typeof matterMilestonesService.updateMatterMilestone>[0]['data'],
        },
        scopedCtx
      );
    },
  },
  request: {
    params: z.object({
      matter_id: z.uuid(),
      milestone_id: z.uuid(),
    }),
    body: {
      content: {
        'application/json': {
          schema: updateMatterMilestoneRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Milestone updated successfully',
      content: {
        'application/json': {
          schema: matterMilestoneResponseSchema,
        },
      },
    },
  },
});

export const deleteMilestoneRoute = routeBuilder.build({
  method: 'delete',
  path: '/{matter_id}/milestones/{milestone_id}',
  tags,
  summary: 'Delete a milestone',
  mcp: {
    name: 'delete_milestone',
    scope: 'matters:write',
    handler: async (args, ctx) => {
      const scopedCtx = { ...ctx, matterId: args.matter_id as string };
      await matterMilestonesService.deleteMatterMilestone({ milestoneId: args.milestone_id as string }, scopedCtx);
      return { deleted: true };
    },
  },
  request: {
    params: z.object({
      matter_id: z.uuid(),
      milestone_id: z.uuid(),
    }),
  },
  responses: {
    204: {
      description: 'Milestone deleted successfully',
    },
  },
});

export const reorderMilestonesRoute = routeBuilder.build({
  method: 'post',
  path: '/{matter_id}/milestones/reorder',
  tags,
  summary: 'Reorder milestones',
  mcp: {
    name: 'reorder_milestones',
    scope: 'matters:write',
    handler: async (args, ctx) => {
      const { matter_id, ...data } = args;
      const scopedCtx = { ...ctx, matterId: matter_id as string };
      await matterMilestonesService.reorderMilestones(
        { data: data as Parameters<typeof matterMilestonesService.reorderMilestones>[0]['data'] },
        scopedCtx
      );
      return { reordered: true };
    },
  },
  request: {
    params: z.object({
      matter_id: z.uuid(),
    }),
    body: {
      content: {
        'application/json': {
          schema: reorderMatterMilestonesRequestSchema,
        },
      },
    },
  },
  responses: {
    204: {
      description: 'Milestones reordered successfully',
    },
  },
});
