import { createRoute, z } from '@hono/zod-openapi';
import { practiceValidations } from '@/modules/practice/validations/practice.validation';

const practiceUuidParamOpenAPISchema = z.object({
  uuid: z
    .uuid()
    .openapi({
      param: {
        name: 'uuid',
        in: 'path',
      },
      description: 'Practice/Organization ID (UUID)',
      example: '123e4567-e89b-12d3-a456-426614174000',
    }),
});

export const listPracticesRoute = createRoute({
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
    400: {
      content: {
        'application/json': {
          schema: practiceValidations.errorResponseSchema,
        },
      },
      description: 'Invalid request',
    },
    500: {
      content: {
        'application/json': {
          schema: practiceValidations.internalServerErrorResponseSchema,
        },
      },
      description: 'Internal server error',
    },
  },
});

export const createPracticeRoute = createRoute({
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
    400: {
      content: {
        'application/json': {
          schema: practiceValidations.errorResponseSchema,
        },
      },
      description: 'Invalid request data',
    },
    500: {
      content: {
        'application/json': {
          schema: practiceValidations.internalServerErrorResponseSchema,
        },
      },
      description: 'Failed to create practice',
    },
  },
});

export const getPracticeByIdRoute = createRoute({
  method: 'get',
  path: '/{uuid}',
  tags: ['Practice'],
  summary: 'Get practice by ID',
  description: 'Retrieve a specific practice by its UUID',
  request: {
    params: practiceUuidParamOpenAPISchema,
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
    404: {
      content: {
        'application/json': {
          schema: practiceValidations.notFoundResponseSchema,
        },
      },
      description: 'Practice not found',
    },
    400: {
      content: {
        'application/json': {
          schema: practiceValidations.errorResponseSchema,
        },
      },
      description: 'Invalid request parameters',
    },
  },
});

export const updatePracticeRoute = createRoute({
  method: 'put',
  path: '/{uuid}',
  tags: ['Practice'],
  summary: 'Update practice',
  description: 'Update an existing practice',
  request: {
    params: practiceUuidParamOpenAPISchema,
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
    404: {
      content: {
        'application/json': {
          schema: practiceValidations.notFoundResponseSchema,
        },
      },
      description: 'Practice not found',
    },
    400: {
      content: {
        'application/json': {
          schema: practiceValidations.errorResponseSchema,
        },
      },
      description: 'Invalid request data',
    },
    500: {
      content: {
        'application/json': {
          schema: practiceValidations.internalServerErrorResponseSchema,
        },
      },
      description: 'Failed to update practice',
    },
  },
});

export const deletePracticeRoute = createRoute({
  method: 'delete',
  path: '/{uuid}',
  tags: ['Practice'],
  summary: 'Delete practice',
  description: 'Delete a practice by its UUID',
  request: {
    params: practiceUuidParamOpenAPISchema,
  },
  responses: {
    204: {
      description: 'Practice deleted successfully',
    },
    404: {
      content: {
        'application/json': {
          schema: practiceValidations.notFoundResponseSchema,
        },
      },
      description: 'Practice not found',
    },
    400: {
      content: {
        'application/json': {
          schema: practiceValidations.errorResponseSchema,
        },
      },
      description: 'Invalid request parameters',
    },
    500: {
      content: {
        'application/json': {
          schema: practiceValidations.internalServerErrorResponseSchema,
        },
      },
      description: 'Failed to delete practice',
    },
  },
});

export const setActivePracticeRoute = createRoute({
  method: 'put',
  path: '/{uuid}/active',
  tags: ['Practice'],
  summary: 'Set active practice',
  description: 'Set a practice as the active practice for the authenticated user',
  request: {
    params: practiceUuidParamOpenAPISchema,
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
    404: {
      content: {
        'application/json': {
          schema: practiceValidations.notFoundResponseSchema,
        },
      },
      description: 'Practice not found',
    },
    400: {
      content: {
        'application/json': {
          schema: practiceValidations.errorResponseSchema,
        },
      },
      description: 'Invalid request parameters',
    },
    500: {
      content: {
        'application/json': {
          schema: practiceValidations.internalServerErrorResponseSchema,
        },
      },
      description: 'Failed to set active practice',
    },
  },
});
