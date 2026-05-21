import { connectValidations } from '@/modules/stripe/validations/connect.validation';
import { onboardingValidations } from '@/modules/onboarding/validations/onboarding.validation';
import { practiceIdParamSchema } from '@/shared/validations/common';
import { routeBuilder } from '@/shared/router/route-builder';

/**
 * POST /api/stripe/connect/account-session
 * Create a Stripe Account Session for embedded components
 */
const createAccountSessionRoute = routeBuilder.build({
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
  },
});

/**
 * GET /api/stripe/connect/account/{practice_id}
 * Get connected account metadata and readiness status
 */
const getConnectedAccountRoute = routeBuilder.build({
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
  },
});

export { createAccountSessionRoute, getConnectedAccountRoute };
