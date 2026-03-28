import { routeBuilder } from '@/shared/router/route-builder';
import { onboardingValidations } from '@/modules/onboarding/validations/onboarding.validation';

/**
 * GET /api/onboarding/organization/:practice_id/status
 * Get onboarding status for organization
 */
export const getOnboardingStatusRoute = routeBuilder.build({
  method: 'get',
  path: '/organization/{practice_id}/status',
  tags: ['Onboarding'],
  summary: 'Get onboarding status',
  description: 'Retrieve the onboarding status for a specific organization',
  request: {
    params: onboardingValidations.practiceIdParamSchema,
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: onboardingValidations.onboardingStatusResponseSchema,
        },
      },
      description: 'Onboarding status retrieved successfully',
    },
    404: {
      content: {
        'application/json': {
          schema: onboardingValidations.notFoundResponseSchema,
        },
      },
      description: 'Onboarding status not found',
    },
    400: {
      content: {
        'application/json': {
          schema: onboardingValidations.errorResponseSchema,
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
export const createConnectedAccountRoute = routeBuilder.build({
  method: 'post',
  path: '/connected-accounts',
  tags: ['Onboarding'],
  summary: 'Initialize Hosted Onboarding Flow',
  description:
    'Creates a Stripe connected account (if needed) and returns a hosted onboarding URL for the organization',
  request: {
    body: {
      content: {
        'application/json': {
          schema: onboardingValidations.createConnectedAccountSchema,
        },
      },
      description: 'Connected account creation data',
    },
  },
  responses: {
    201: {
      content: {
        'application/json': {
          schema: onboardingValidations.createConnectedAccountResponseSchema,
        },
      },
      description: 'Connected account created successfully',
    },
    400: {
      content: {
        'application/json': {
          schema: onboardingValidations.errorResponseSchema,
        },
      },
      description: 'Invalid request data',
    },
    500: {
      content: {
        'application/json': {
          schema: onboardingValidations.internalServerErrorResponseSchema,
        },
      },
      description: 'Failed to create connected account',
    },
  },
});

export const routes = {
  getOnboardingStatusRoute,
  createConnectedAccountRoute,
};
