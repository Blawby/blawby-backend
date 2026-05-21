import { subscriptionValidations } from './validations/subscription.validation';
import { routeBuilder } from '@/shared/router/route-builder';

/**
 * GET /api/subscriptions/plans
 * List all available subscription plans
 */
const listPlansRoute = routeBuilder.build({
  method: 'get',
  path: '/plans',
  tags: ['Subscriptions'],
  summary: 'List subscription plans',
  description: 'Get all available subscription plans. Requires authentication but no active organization.',
  responses: {
    200: {
      content: {
        'application/json': {
          schema: subscriptionValidations.listPlansResponseSchema,
        },
      },
      description: 'Plans retrieved successfully',
    },
  },
});

/**
 * GET /api/subscriptions/current
 * Get current organization's subscription
 */
const getCurrentSubscriptionRoute = routeBuilder.build({
  method: 'get',
  path: '/current',
  tags: ['Subscriptions'],
  summary: 'Get current subscription',
  description: "Get the current organization's active subscription",
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
  },
});

/**
 * POST /api/subscriptions/cancel
 * Cancel subscription
 */
const cancelSubscriptionRoute = routeBuilder.build({
  method: 'post',
  path: '/cancel',
  tags: ['Subscriptions'],
  summary: 'Cancel subscription',
  description:
    "Cancel the current organization's subscription. Returns a Stripe Billing Portal URL for the user to confirm cancellation.",
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
      description: 'Cancellation portal URL returned successfully',
    },
  },
});

export const routes = {
  listPlansRoute,
  getCurrentSubscriptionRoute,
  cancelSubscriptionRoute,
};
