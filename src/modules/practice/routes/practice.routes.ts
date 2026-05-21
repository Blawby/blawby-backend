import { z } from '@hono/zod-openapi';
import { practiceValidations } from '@/modules/practice/validations/practice.validation';
import { routeBuilder } from '@/shared/router/route-builder';

const practiceIdParamSchema = z.object({
  practice_id: z.uuid().openapi({
    param: {
      name: 'practice_id',
      in: 'path',
    },
    description: 'Practice ID (UUID)',
    example: '123e4567-e89b-12d3-a456-426614174000',
  }),
});

export const listPracticesRoute = routeBuilder.build({
  method: 'get',
  path: '/list',
  tags: ['Practice'],
  summary: 'List practices',
  description: 'Retrieve all practices for the authenticated user',
  responses: {
    200: {
      content: {
        'application/json': {
          schema: practiceValidations.practiceListResponseSchema,
        },
      },
      description: 'Practices retrieved successfully',
    },
  },
});

export const createPracticeRoute = routeBuilder.build({
  method: 'post',
  path: '/',
  tags: ['Practice'],
  summary: 'Create practice',
  description: 'Create a new practice (organization with optional practice details)',
  request: {
    body: {
      content: {
        'application/json': {
          schema: practiceValidations.createPracticeSchema,
        },
      },
      description: 'Practice creation data',
    },
  },
  responses: {
    201: {
      content: {
        'application/json': {
          schema: practiceValidations.practiceSingleResponseSchema,
        },
      },
      description: 'Practice created successfully',
    },
  },
});

export const getPracticeByIdRoute = routeBuilder.build({
  method: 'get',
  path: '/{practice_id}',
  tags: ['Practice'],
  summary: 'Get practice by ID',
  description: 'Retrieve a specific practice by its UUID',
  request: {
    params: practiceIdParamSchema,
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: practiceValidations.practiceSingleResponseSchema,
        },
      },
      description: 'Practice retrieved successfully',
    },
  },
});

export const updatePracticeRoute = routeBuilder.build({
  method: 'put',
  path: '/{practice_id}',
  tags: ['Practice'],
  summary: 'Update practice',
  description: 'Update an existing practice',
  request: {
    params: practiceIdParamSchema,
    body: {
      content: {
        'application/json': {
          schema: practiceValidations.updatePracticeSchema,
        },
      },
      description: 'Practice update data',
    },
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: practiceValidations.practiceSingleResponseSchema,
        },
      },
      description: 'Practice updated successfully',
    },
  },
});

export const deletePracticeRoute = routeBuilder.build({
  method: 'delete',
  path: '/{practice_id}',
  tags: ['Practice'],
  summary: 'Delete practice',
  description: 'Delete a practice by its UUID',
  request: {
    params: practiceIdParamSchema,
  },
  responses: {
    204: {
      description: 'Practice deleted successfully',
    },
  },
});

export const setActivePracticeRoute = routeBuilder.build({
  method: 'put',
  path: '/{practice_id}/active',
  tags: ['Practice'],
  summary: 'Set active practice',
  description: 'Set a practice as the active practice for the authenticated user',
  request: {
    params: practiceIdParamSchema,
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: practiceValidations.setActivePracticeResponseSchema,
        },
      },
      description: 'Practice set as active successfully',
    },
  },
});
