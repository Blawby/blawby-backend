import { createRoute } from '@hono/zod-openapi';
import { subscriptionValidations } from './validations/subscription.validation';

/**
 * GET /api/subscriptions/plans
 * List all available subscription plans
 */
export const listPlansRoute = createRoute({
  method: 'get',
  path: '/plans',
  tags: ['Subscriptions'],
  summary: 'List subscription plans',
  description: 'Get all available subscription plans (public endpoint)',
  responses: {
    200: {
      content: {
        'application/json': {
          schema: subscriptionValidations.listPlansResponseSchema,
        },
      },
      description: 'Plans retrieved successfully',
    },
    500: {
      content: {
        'application/json': {
          schema: subscriptionValidations.internalServerErrorResponseSchema,
        },
      },
      description: 'Internal server error',
    },
  },
});

/**
 * GET /api/subscriptions/current
 * Get current organization's subscription
 */
export const getCurrentSubscriptionRoute = createRoute({
  method: 'get',
  path: '/current',
  tags: ['Subscriptions'],
  summary: 'Get current subscription',
  description: 'Get the current organization\'s active subscription',
  security: [{ Bearer: [] }],
  responses: {
    200: {
      content: {
        'application/json': {
          schema: subscriptionValidations.getCurrentSubscriptionResponseSchema,
        },
      },
      description: 'Subscription retrieved successfully',
    },
    400: {
      content: {
        'application/json': {
          schema: subscriptionValidations.errorResponseSchema,
        },
      },
      description: 'Bad request',
    },
    500: {
      content: {
        'application/json': {
          schema: subscriptionValidations.internalServerErrorResponseSchema,
        },
      },
      description: 'Internal server error',
    },
  },
});

/**
 * POST /api/subscriptions/cancel
 * Cancel subscription
 */
export const cancelSubscriptionRoute = createRoute({
  method: 'post',
  path: '/cancel',
  tags: ['Subscriptions'],
  summary: 'Cancel subscription',
  description: 'Cancel the current organization\'s subscription',
  security: [{ Bearer: [] }],
  request: {
    body: {
      content: {
        'application/json': {
          schema: subscriptionValidations.cancelSubscriptionSchema,
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: subscriptionValidations.cancelSubscriptionResponseSchema,
        },
      },
      description: 'Subscription cancelled successfully',
    },
    400: {
      content: {
        'application/json': {
          schema: subscriptionValidations.errorResponseSchema,
        },
      },
      description: 'Bad request',
    },
    404: {
      content: {
        'application/json': {
          schema: subscriptionValidations.notFoundResponseSchema,
        },
      },
      description: 'Subscription not found',
    },
    500: {
      content: {
        'application/json': {
          schema: subscriptionValidations.internalServerErrorResponseSchema,
        },
      },
      description: 'Internal server error',
    },
  },
});
