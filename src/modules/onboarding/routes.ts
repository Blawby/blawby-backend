import { createRoute, z } from '@hono/zod-openapi';

import {
  createConnectedAccountSchema,
  createConnectedAccountResponseSchema,
  errorResponseSchema,
  internalServerErrorResponseSchema,
  notFoundResponseSchema,
  onboardingStatusResponseSchema,
} from '@/modules/onboarding/validations/onboarding.validation';

/**
 * OpenAPI param schema with metadata
 */
const organizationIdParamOpenAPISchema = z.object({
  organizationId: z
    .uuid()
    .openapi({
      param: {
        name: 'organizationId',
        in: 'path',
      },
      example: '123e4567-e89b-12d3-a456-426614174000',
    }),
});

/**
 * GET /api/onboarding/organization/:organizationId/status
 * Get onboarding status for organization
 */
export const getOnboardingStatusRoute = createRoute({
  method: 'get',
  path: '/organization/{organizationId}/status',
  tags: ['Onboarding'],
  summary: 'Get onboarding status',
  description: 'Retrieve the onboarding status for a specific organization',
  request: {
    params: organizationIdParamOpenAPISchema,
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: onboardingStatusResponseSchema,
        },
      },
      description: 'Onboarding status retrieved successfully',
    },
    404: {
      content: {
        'application/json': {
          schema: notFoundResponseSchema,
        },
      },
      description: 'Onboarding status not found',
    },
    400: {
      content: {
        'application/json': {
          schema: errorResponseSchema,
        },
      },
      description: 'Invalid request parameters',
    },
  },
});

/**
 * POST /api/onboarding/connected-accounts
 * Create connected account for organization (includes session creation)
 */
export const createConnectedAccountRoute = createRoute({
  method: 'post',
  path: '/connected-accounts',
  tags: ['Onboarding'],
  summary: 'Create connected account',
  description: 'Create a Stripe connected account for an organization and initialize onboarding session',
  request: {
    body: {
      content: {
        'application/json': {
          schema: createConnectedAccountSchema,
        },
      },
      description: 'Connected account creation data',
    },
  },
  responses: {
    201: {
      content: {
        'application/json': {
          schema: createConnectedAccountResponseSchema,
        },
      },
      description: 'Connected account created successfully',
    },
    400: {
      content: {
        'application/json': {
          schema: errorResponseSchema,
        },
      },
      description: 'Invalid request data',
    },
    500: {
      content: {
        'application/json': {
          schema: internalServerErrorResponseSchema,
        },
      },
      description: 'Failed to create connected account',
    },
  },
});

