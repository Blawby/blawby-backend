import { createRoute, z } from '@hono/zod-openapi';

import {
  createSubscriptionSchema,
  cancelSubscriptionSchema,
  subscriptionIdParamSchema,
  listPlansResponseSchema,
  getCurrentSubscriptionResponseSchema,
  createSubscriptionResponseSchema,
  cancelSubscriptionResponseSchema,
  subscriptionWithDetailsResponseSchema,
} from '@/modules/subscriptions/validations/subscription.validation';
import {
  errorResponseSchema,
  notFoundResponseSchema,
  internalServerErrorResponseSchema,
} from '@/modules/subscriptions/validations/subscription.validation';

/**
 * GET /api/subscriptions/plans
 * List all available subscription plans
 */
export const listPlansRoute = createRoute({
  method: 'get',
  path: '/plans',
  tags: ['Subscriptions'],
  summary: 'List subscription plans',
  description: 'Retrieve all available subscription plans. Requires authentication.',
  security: [{ Bearer: [] }],
  responses: {
    200: {
      content: {
        'application/json': {
          schema: listPlansResponseSchema,
        },
      },
      description: 'Plans retrieved successfully',
    },
    401: {
      content: {
        'application/json': {
          schema: errorResponseSchema,
        },
      },
      description: 'Unauthorized - Authentication required',
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
 * GET /api/subscriptions/current
 * Get current organization's subscription
 */
export const getCurrentSubscriptionRoute = createRoute({
  method: 'get',
  path: '/current',
  tags: ['Subscriptions'],
  summary: 'Get current subscription',
  description: 'Retrieve the active subscription for the current organization. Requires authentication and active organization.',
  security: [{ Bearer: [] }],
  responses: {
    200: {
      content: {
        'application/json': {
          schema: getCurrentSubscriptionResponseSchema,
        },
      },
      description: 'Subscription retrieved successfully',
    },
    400: {
      content: {
        'application/json': {
          schema: errorResponseSchema,
        },
      },
      description: 'Bad Request - No active organization',
    },
    401: {
      content: {
        'application/json': {
          schema: errorResponseSchema,
        },
      },
      description: 'Unauthorized - Authentication required',
    },
    404: {
      content: {
        'application/json': {
          schema: notFoundResponseSchema,
        },
      },
      description: 'No active subscription found',
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
 * POST /api/subscriptions/create
 * Create/upgrade subscription
 */
export const createSubscriptionRoute = createRoute({
  method: 'post',
  path: '/create',
  tags: ['Subscriptions'],
  summary: 'Create subscription',
  description: 'Create or upgrade a subscription for the current organization. Requires planId (UUID). Creates Stripe customer if needed and returns checkout URL. Requires authentication and active organization.',
  security: [{ Bearer: [] }],
  request: {
    body: {
      content: {
        'application/json': {
          schema: createSubscriptionSchema,
        },
      },
      description: 'Subscription creation data. planId (UUID) is required, plan (name) is optional.',
    },
  },
  responses: {
    201: {
      content: {
        'application/json': {
          schema: createSubscriptionResponseSchema,
        },
      },
      description: 'Subscription created successfully',
    },
    400: {
      content: {
        'application/json': {
          schema: errorResponseSchema,
        },
      },
      description: 'Bad Request - Invalid request data, plan not found, plan not active, or no active organization',
    },
    401: {
      content: {
        'application/json': {
          schema: errorResponseSchema,
        },
      },
      description: 'Unauthorized - Authentication required',
    },
    500: {
      content: {
        'application/json': {
          schema: internalServerErrorResponseSchema,
        },
      },
      description: 'Failed to create subscription',
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
  description: 'Cancel the active subscription for the current organization. Can cancel immediately or at the end of the billing period. Requires authentication and active organization.',
  security: [{ Bearer: [] }],
  request: {
    body: {
      content: {
        'application/json': {
          schema: cancelSubscriptionSchema,
        },
      },
      description: 'Cancellation data',
    },
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: cancelSubscriptionResponseSchema,
        },
      },
      description: 'Subscription cancelled successfully',
    },
    400: {
      content: {
        'application/json': {
          schema: errorResponseSchema,
        },
      },
      description: 'Bad Request - Invalid request or no active organization',
    },
    401: {
      content: {
        'application/json': {
          schema: errorResponseSchema,
        },
      },
      description: 'Unauthorized - Authentication required',
    },
    404: {
      content: {
        'application/json': {
          schema: notFoundResponseSchema,
        },
      },
      description: 'Subscription not found',
    },
    500: {
      content: {
        'application/json': {
          schema: internalServerErrorResponseSchema,
        },
      },
      description: 'Failed to cancel subscription',
    },
  },
});

/**
 * GET /api/subscriptions/:subscriptionId
 * Get subscription by ID
 */
export const getSubscriptionByIdRoute = createRoute({
  method: 'get',
  path: '/{subscriptionId}',
  tags: ['Subscriptions'],
  summary: 'Get subscription by ID',
  description: 'Retrieve a specific subscription by its ID. The subscription must belong to the user\'s organization. Requires authentication and active organization.',
  security: [{ Bearer: [] }],
  request: {
    params: subscriptionIdParamSchema,
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: subscriptionWithDetailsResponseSchema,
        },
      },
      description: 'Subscription retrieved successfully',
    },
    400: {
      content: {
        'application/json': {
          schema: errorResponseSchema,
        },
      },
      description: 'Bad Request - No active organization',
    },
    401: {
      content: {
        'application/json': {
          schema: errorResponseSchema,
        },
      },
      description: 'Unauthorized - Authentication required',
    },
    404: {
      content: {
        'application/json': {
          schema: notFoundResponseSchema,
        },
      },
      description: 'Subscription not found',
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

