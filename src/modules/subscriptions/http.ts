import { OpenAPIHono } from '@hono/zod-openapi';
import * as routes from '@/modules/subscriptions/routes';
import * as subscriptionService from '@/modules/subscriptions/services/subscription.service';
import * as subscriptionValidations from '@/modules/subscriptions/validations/subscription.validation';
import type { Subscription } from '@/modules/subscriptions/types/subscription.types';
import { validateParams, validateJson } from '@/shared/middleware/validation';
import { registerOpenApiRoutes } from '@/shared/router/openapi-docs';
import type { AppContext } from '@/shared/types/hono';
import { response } from '@/shared/utils/responseUtils';

const subscriptionsApp = new OpenAPIHono<AppContext>();

/**
 * GET /api/subscriptions/plans
 * List all available subscription plans (public endpoint)
 */
subscriptionsApp.get('/plans', async (c) => {
  const plans = await subscriptionService.listPlans();
  return response.ok(c, { plans });
});


/**
 * GET /api/subscriptions/current
 * Get current organization's subscription
 */
subscriptionsApp.get('/current', async (c) => {
  const user = c.get('user')!;
  const organizationId = c.get('activeOrganizationId');

  if (!organizationId) {
    return response.badRequest(
      c,
      'No active organization. Please select an organization first.',
    );
  }

  const result = await subscriptionService.getCurrentSubscription(
    organizationId,
    user,
    c.req.header() as Record<string, string>,
  );

  if (!result.subscription) {
    return response.ok(c, { subscription: null });
  }

  return response.ok(c, {
    subscription: {
      ...result.subscription,
      lineItems: result.lineItems,
      events: result.events,
    },
  });
});


/**
 * POST /api/subscriptions/create
 * Create/upgrade subscription
 */
subscriptionsApp.post(
  '/create',
  validateJson(
    subscriptionValidations.createSubscriptionSchema,
    'Invalid subscription data',
  ),
  async (c) => {
    const user = c.get('user')!;
    const organizationId = c.get('activeOrganizationId');
    const validatedBody = c.get('validatedBody');

    if (!organizationId) {
      return response.badRequest(
        c,
        'No active organization. Please select an organization first.',
      );
    }

    const result = await subscriptionService.createSubscription(
      organizationId,
      validatedBody,
      user,
      c.req.header() as Record<string, string>,
    );

    return response.created(c, result);
  },
);


/**
 * POST /api/subscriptions/cancel
 * Cancel subscription
 */
subscriptionsApp.post(
  '/cancel',
  validateJson(
    subscriptionValidations.cancelSubscriptionSchema,
    'Invalid cancellation data',
  ),
  async (c) => {
    const user = c.get('user')!;
    const organizationId = c.get('activeOrganizationId');
    const validatedBody = c.get('validatedBody');

    if (!organizationId) {
      return response.badRequest(
        c,
        'No active organization. Please select an organization first.',
      );
    }

    // Get current subscription to find subscription ID
    const currentSub = await subscriptionService.getCurrentSubscription(
      organizationId,
      user,
      c.req.header() as Record<string, string>,
    );

    if (!currentSub.subscription) {
      return response.notFound(c, 'No active subscription found');
    }

    // Extract subscription ID from Better Auth subscription object
    const subscription = currentSub.subscription as Subscription;
    const subscriptionId = subscription.id;

    const result = await subscriptionService.cancelSubscription(
      subscriptionId,
      organizationId,
      validatedBody,
      user,
      c.req.header() as Record<string, string>,
    );

    return response.ok(c, result);
  },
);

registerOpenApiRoutes(subscriptionsApp, routes);

export default subscriptionsApp;

