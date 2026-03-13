import { createRoute } from '@hono/zod-openapi';

import { connectValidations } from '@/modules/stripe/validations/connect.validation';
import { onboardingValidations } from '@/modules/onboarding/validations/onboarding.validation';
import { practiceIdParamSchema } from '@/shared/validations/common';

/**
 * POST /api/stripe/connect/account-session
 * Create a Stripe Account Session for embedded components
 */
const createAccountSessionRoute = createRoute({
  method: 'post',
  path: '/connect/account-session',
  tags: ['Stripe Connect'],
  summary: 'Create Account Session',
  description:
    'Creates a Stripe Account Session for embedded Connect components and returns a client_secret for frontend initialization.',
  request: {
    body: {
      content: {
        'application/json': {
          schema: connectValidations.createAccountSessionSchema,
        },
      },
    },
  },
  responses: {
    201: {
      content: {
        'application/json': {
          schema: connectValidations.accountSessionResponseSchema,
        },
      },
      description: 'Account session created successfully',
    },
    400: {
      content: {
        'application/json': {
          schema: onboardingValidations.errorResponseSchema,
        },
      },
      description: 'Invalid request data',
    },
    404: {
      content: {
        'application/json': {
          schema: onboardingValidations.notFoundResponseSchema,
        },
      },
      description: 'Connected account not found for this practice',
    },
    500: {
      content: {
        'application/json': {
          schema: onboardingValidations.internalServerErrorResponseSchema,
        },
      },
      description: 'Failed to create account session',
    },
  },
});

/**
 * GET /api/stripe/connect/account/{practice_id}
 * Get connected account metadata and readiness status
 */
const getConnectedAccountRoute = createRoute({
  method: 'get',
  path: '/connect/account/{practice_id}',
  tags: ['Stripe Connect'],
  summary: 'Get Connected Account',
  description: 'Returns connected account metadata, capabilities, and readiness status for a practice.',
  request: {
    params: practiceIdParamSchema,
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: onboardingValidations.getAccountResponseSchema,
        },
      },
      description: 'Connected account details retrieved successfully',
    },
    404: {
      content: {
        'application/json': {
          schema: onboardingValidations.notFoundResponseSchema,
        },
      },
      description: 'Connected account not found for this practice',
    },
    500: {
      content: {
        'application/json': {
          schema: onboardingValidations.internalServerErrorResponseSchema,
        },
      },
      description: 'Failed to retrieve connected account',
    },
  },
});

export { createAccountSessionRoute, getConnectedAccountRoute };
