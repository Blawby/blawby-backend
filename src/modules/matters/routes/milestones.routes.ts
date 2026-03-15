import { z } from '@hono/zod-openapi';
import {
  createMatterMilestoneRequestSchema,
  updateMatterMilestoneRequestSchema,
  matterMilestoneResponseSchema,
  listMatterMilestonesQuerySchema,
  reorderMatterMilestonesRequestSchema,
} from '@/modules/matters/types/matter.types';
import { routeBuilder } from '@/shared/router/route-builder';

const tags = ['Matters'];

export const listMilestonesRoute = routeBuilder.build({
  method: 'get',
  path: '/milestones',
  tags,
  summary: 'List milestones',
  request: {
    params: z.object({
      id: z.uuid(),
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
  path: '/milestones',
  tags,
  summary: 'Create a milestone',
  request: {
    params: z.object({
      id: z.uuid(),
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
  path: '/milestones/{milestone_id}',
  tags,
  summary: 'Update a milestone',
  request: {
    params: z.object({
      id: z.uuid(),
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
  path: '/milestones/{milestone_id}',
  tags,
  summary: 'Delete a milestone',
  request: {
    params: z.object({
      id: z.uuid(),
      milestone_id: z.uuid(),
    }),
  },
  responses: {
    200: {
      description: 'Milestone deleted successfully',
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

export const reorderMilestonesRoute = routeBuilder.build({
  method: 'post',
  path: '/milestones/reorder',
  tags,
  summary: 'Reorder milestones',
  request: {
    params: z.object({
      id: z.uuid(),
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
    200: {
      description: 'Milestones reordered successfully',
      content: {
        'application/json': {
          schema: z.array(matterMilestoneResponseSchema),
        },
      },
    },
  },
});
