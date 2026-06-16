import { z } from '@hono/zod-openapi';
import { matterDeadlineValidations } from '@/modules/matters/validations/matter-deadlines.validation';
import { matterDeadlinesService } from '@/modules/matters/services/matter-deadlines.service';
import { routeBuilder } from '@/shared/router/route-builder';

const tags = ['Matters'];

const listDeadlinesRoute = routeBuilder.build({
  method: 'get',
  path: '/{matter_id}/deadlines',
  tags,
  summary: 'List deadlines',
  mcp: {
    name: 'list_deadlines',
    scope: 'matters:read',
    handler: async (args, ctx) =>
      matterDeadlinesService.listDeadlines({}, { ...ctx, matterId: args.matter_id as string }),
  },
  request: {
    params: z.object({ matter_id: z.uuid() }),
  },
  responses: {
    200: {
      description: 'Deadlines retrieved successfully',
      content: {
        'application/json': {
          schema: z.array(matterDeadlineValidations.deadlineResponseSchema),
        },
      },
    },
  },
});

const createDeadlineRoute = routeBuilder.build({
  method: 'post',
  path: '/{matter_id}/deadlines',
  tags,
  summary: 'Create a deadline',
  mcp: {
    name: 'create_deadline',
    scope: 'matters:write',
    handler: async (args, ctx) => {
      const { matter_id, ...data } = args;
      return matterDeadlinesService.createDeadline(
        { data: data as Parameters<typeof matterDeadlinesService.createDeadline>[0]['data'] },
        { ...ctx, matterId: matter_id as string }
      );
    },
  },
  request: {
    params: z.object({ matter_id: z.uuid() }),
    body: {
      content: {
        'application/json': {
          schema: matterDeadlineValidations.createMatterDeadlineSchema,
        },
      },
    },
  },
  responses: {
    201: {
      description: 'Deadline created successfully',
      content: {
        'application/json': {
          schema: matterDeadlineValidations.deadlineResponseSchema,
        },
      },
    },
  },
});

const updateDeadlineRoute = routeBuilder.build({
  method: 'patch',
  path: '/{matter_id}/deadlines/{deadline_id}',
  tags,
  summary: 'Update a deadline',
  mcp: {
    name: 'update_deadline',
    scope: 'matters:write',
    handler: async (args, ctx) => {
      const { matter_id, deadline_id, ...data } = args;
      return matterDeadlinesService.updateDeadline(
        {
          deadlineId: deadline_id as string,
          data: data as Parameters<typeof matterDeadlinesService.updateDeadline>[0]['data'],
        },
        { ...ctx, matterId: matter_id as string }
      );
    },
  },
  request: {
    params: z.object({ matter_id: z.uuid(), deadline_id: z.uuid() }),
    body: {
      content: {
        'application/json': {
          schema: matterDeadlineValidations.updateMatterDeadlineSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Deadline updated successfully',
      content: {
        'application/json': {
          schema: matterDeadlineValidations.deadlineResponseSchema,
        },
      },
    },
  },
});

const deleteDeadlineRoute = routeBuilder.build({
  method: 'delete',
  path: '/{matter_id}/deadlines/{deadline_id}',
  tags,
  summary: 'Delete a deadline',
  mcp: {
    name: 'delete_deadline',
    scope: 'matters:write',
    handler: async (args, ctx) => {
      await matterDeadlinesService.deleteDeadline(
        { deadlineId: args.deadline_id as string },
        { ...ctx, matterId: args.matter_id as string }
      );
      return { deleted: true };
    },
  },
  request: {
    params: z.object({ matter_id: z.uuid(), deadline_id: z.uuid() }),
  },
  responses: {
    204: {
      description: 'Deadline deleted successfully',
    },
  },
});

export const mattersDeadlinesRoutes = {
  listDeadlinesRoute,
  createDeadlineRoute,
  updateDeadlineRoute,
  deleteDeadlineRoute,
};
