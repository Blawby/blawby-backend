import { createRoute, z } from '@hono/zod-openapi';

import {
  createSubscriptionSchema,
  cancelSubscriptionSchema,
  subscriptionPlanResponseSchema,
  subscriptionResponseSchema,
  errorResponseSchema,
  notFoundResponseSchema,
  internalServerErrorResponseSchema,
} from './validations/subscription.validation';

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
          schema: z.object({
            plans: z.array(subscriptionPlanResponseSchema),
          }),
        },
      },
      description: 'Plans retrieved successfully',
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
  description: 'Get the current organization\'s active subscription',
  security: [{ Bearer: [] }],
  responses: {
    200: {
      content: {
        'application/json': {
          schema: z.object({
            subscription: subscriptionResponseSchema.nullable(),
          }),
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
      description: 'Bad request',
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
  description: 'Create or upgrade a subscription for the current organization',
  security: [{ Bearer: [] }],
  request: {
    body: {
      content: {
        'application/json': {
          schema: createSubscriptionSchema,
        },
      },
    },
  },
  responses: {
    201: {
      content: {
        'application/json': {
          schema: subscriptionResponseSchema,
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
      description: 'Bad request',
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
          schema: cancelSubscriptionSchema,
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: subscriptionResponseSchema,
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
      description: 'Bad request',
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

