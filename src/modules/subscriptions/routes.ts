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

/**
 * POST /api/subscriptions/checkout
 * Create a Stripe checkout session (auth required, no org needed — auto-creates if absent)
 */
const checkoutRoute = routeBuilder.build({
  method: 'post',
  path: '/checkout',
  tags: ['Subscriptions'],
  summary: 'Create checkout session',
  description: 'Create a Stripe Checkout Session for a given price. Auto-creates an org if the user has none.',
  security: [{ Bearer: [] }],
  request: {
    body: {
      content: {
        'application/json': { schema: subscriptionValidations.checkoutRequestSchema },
      },
    },
  },
  responses: {
    200: {
      content: {
        'application/json': { schema: subscriptionValidations.checkoutResponseSchema },
      },
      description: 'Checkout session created',
    },
  },
});

/**
 * POST /api/subscriptions/billing-portal
 * Create a Stripe Billing Portal session
 */
const billingPortalRoute = routeBuilder.build({
  method: 'post',
  path: '/billing-portal',
  tags: ['Subscriptions'],
  summary: 'Create billing portal session',
  description: 'Create a Stripe Billing Portal session to manage or cancel the active subscription.',
  security: [{ Bearer: [] }],
  request: {
    body: {
      content: {
        'application/json': { schema: subscriptionValidations.billingPortalRequestSchema },
      },
    },
  },
  responses: {
    200: {
      content: {
        'application/json': { schema: subscriptionValidations.cancelSubscriptionResponseSchema },
      },
      description: 'Billing portal URL returned',
    },
  },
});

/**
 * GET /api/subscriptions/list
 * List subscriptions for active org
 */
const listSubscriptionsRoute = routeBuilder.build({
  method: 'get',
  path: '/list',
  tags: ['Subscriptions'],
  summary: 'List subscriptions',
  description: "List active organization's subscriptions.",
  security: [{ Bearer: [] }],
  responses: {
    200: {
      content: {
        'application/json': { schema: subscriptionValidations.listSubscriptionsResponseSchema },
      },
      description: 'Subscriptions listed',
    },
  },
});

/**
 * POST /api/subscriptions/webhook
 * Stripe webhook endpoint (no auth — signature verified by service)
 */
const webhookRoute = routeBuilder.build({
  method: 'post',
  path: '/webhook',
  tags: ['Subscriptions'],
  summary: 'Stripe webhook',
  description: 'Receives and processes Stripe webhook events. Signature is verified internally.',
  responses: {
    200: {
      content: {
        'application/json': { schema: subscriptionValidations.webhookResponseSchema },
      },
      description: 'Webhook received',
    },
  },
});

export const routes = {
  listPlansRoute,
  getCurrentSubscriptionRoute,
  cancelSubscriptionRoute,
  checkoutRoute,
  billingPortalRoute,
  listSubscriptionsRoute,
  webhookRoute,
};
