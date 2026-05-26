import { z } from '@hono/zod-openapi';
import { matterDeadlineValidations } from '@/modules/matters/validations/matter-deadlines.validation';
import { routeBuilder } from '@/shared/router/route-builder';

const tags = ['Matters'];

const listDeadlinesRoute = routeBuilder.build({
  method: 'get',
  path: '/{matter_id}/deadlines',
  tags,
  summary: 'List deadlines',
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
