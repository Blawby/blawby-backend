import { createRoute, z } from '@hono/zod-openapi';

import {
  createPracticeClientIntakeSchema,
  updatePracticeClientIntakeSchema,
  slugParamSchema,
  uuidParamSchema,
  practiceClientIntakeSettingsResponseSchema,
  createPracticeClientIntakeResponseSchema,
  updatePracticeClientIntakeResponseSchema,
  practiceClientIntakeStatusResponseSchema,
  errorResponseSchema,
  notFoundResponseSchema,
  internalServerErrorResponseSchema,
} from '@/modules/practice-client-intakes/validations/practice-client-intakes.validation';

/**
 * OpenAPI param schemas with metadata
 */
const slugParamOpenAPISchema = z.object({
  slug: z
    .string()
    .min(1)
    .max(100)
    .openapi({
      param: {
        name: 'slug',
        in: 'path',
      },
      description: 'Organization slug',
      example: 'my-practice',
    }),
});

const uuidParamOpenAPISchema = z.object({
  uuid: z
    .string()
    .uuid()
    .openapi({
      param: {
        name: 'uuid',
        in: 'path',
      },
      description: 'Practice client intake UUID (returned when creating an intake, used to identify the specific intake)',
      example: '123e4567-e89b-12d3-a456-426614174000',
    }),
});

/**
 * GET /:slug/intake
 * Public intake page - returns organization details and payment settings
 */
export const getIntakeSettingsRoute = createRoute({
  method: 'get',
  path: '/{slug}/intake',
  tags: ['Practice Client Intakes'],
  summary: 'Get intake settings',
  description: 'Public endpoint to retrieve organization details and payment settings for client intake',
  request: {
    params: slugParamOpenAPISchema,
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: practiceClientIntakeSettingsResponseSchema,
        },
      },
      description: 'Intake settings retrieved successfully',
    },
    404: {
      content: {
        'application/json': {
          schema: notFoundResponseSchema,
        },
      },
      description: 'Organization not found',
    },
    500: {
      content: {
        'application/json': {
          schema: internalServerErrorResponseSchema,
        },
      },
      description: 'Internal server error',
    },
  },
});

/**
 * POST /api/practice/client-intakes/create
 * Creates payment intent for practice client intake
 */
export const createPracticeClientIntakeRoute = createRoute({
  method: 'post',
  path: '/create',
  tags: ['Practice Client Intakes'],
  summary: 'Create practice client intake',
  description: 'Creates a payment intent for a practice client intake',
  request: {
    body: {
      content: {
        'application/json': {
          schema: createPracticeClientIntakeSchema,
        },
      },
    },
  },
  responses: {
    201: {
      content: {
        'application/json': {
          schema: createPracticeClientIntakeResponseSchema,
        },
      },
      description: 'Practice client intake created successfully',
    },
    400: {
      content: {
        'application/json': {
          schema: errorResponseSchema,
        },
      },
      description: 'Bad request - validation failed',
    },
    500: {
      content: {
        'application/json': {
          schema: internalServerErrorResponseSchema,
        },
      },
      description: 'Internal server error',
    },
  },
});

/**
 * PUT /api/practice/client-intakes/:uuid
 * Updates payment amount before confirmation
 */
export const updatePracticeClientIntakeRoute = createRoute({
  method: 'put',
  path: '/{uuid}',
  tags: ['Practice Client Intakes'],
  summary: 'Update practice client intake',
  description: 'Updates the payment amount for a practice client intake before confirmation. The UUID is obtained from the create endpoint response.',
  request: {
    params: uuidParamOpenAPISchema,
    body: {
      content: {
        'application/json': {
          schema: updatePracticeClientIntakeSchema,
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: updatePracticeClientIntakeResponseSchema,
        },
      },
      description: 'Practice client intake updated successfully',
    },
    400: {
      content: {
        'application/json': {
          schema: errorResponseSchema,
        },
      },
      description: 'Bad request - validation failed or payment already processed',
    },
    404: {
      content: {
        'application/json': {
          schema: notFoundResponseSchema,
        },
      },
      description: 'Practice client intake not found',
    },
    500: {
      content: {
        'application/json': {
          schema: internalServerErrorResponseSchema,
        },
      },
      description: 'Internal server error',
    },
  },
});

/**
 * GET /api/practice/client-intakes/:uuid/status
 * Gets payment status
 */
export const getPracticeClientIntakeStatusRoute = createRoute({
  method: 'get',
  path: '/{uuid}/status',
  tags: ['Practice Client Intakes'],
  summary: 'Get practice client intake status',
  description: 'Retrieves the current status of a practice client intake payment. The UUID is obtained from the create endpoint response.',
  request: {
    params: uuidParamOpenAPISchema,
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: practiceClientIntakeStatusResponseSchema,
        },
      },
      description: 'Status retrieved successfully',
    },
    404: {
      content: {
        'application/json': {
          schema: notFoundResponseSchema,
        },
      },
      description: 'Practice client intake not found',
    },
    500: {
      content: {
        'application/json': {
          schema: internalServerErrorResponseSchema,
        },
      },
      description: 'Internal server error',
    },
  },
});


