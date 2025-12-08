import { OpenAPIHono } from '@hono/zod-openapi';
import * as routes from '@/modules/subscriptions/routes';
import * as subscriptionService from '@/modules/subscriptions/services/subscription.service';
import * as subscriptionValidations from '@/modules/subscriptions/validations/subscription.validation';
import { validateParams, validateJson } from '@/shared/middleware/validation';
import type { AppContext } from '@/shared/types/hono';
import { response } from '@/shared/utils/responseUtils';

const subscriptionsApp = new OpenAPIHono<AppContext>();

/**
 * GET /api/subscriptions/plans
 * List all available subscription plans (public endpoint)
 */
subscriptionsApp.get('/plans', async (c) => {
  try {
    const plans = await subscriptionService.listPlans();
    return response.ok(c, { plans });
  } catch (error) {
    const errorMessage
      = error instanceof Error ? error.message : 'Failed to fetch plans';
    return response.internalServerError(c, errorMessage);
  }
});

// Register OpenAPI route for documentation only
subscriptionsApp.openapi(routes.listPlansRoute, async () => {
  throw new Error('This should never be called');
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

  try {
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
  } catch (error) {
    const errorMessage
      = error instanceof Error ? error.message : 'Failed to fetch subscription';
    return response.internalServerError(c, errorMessage);
  }
});

// Register OpenAPI route for documentation only
subscriptionsApp.openapi(routes.getCurrentSubscriptionRoute, async () => {
  throw new Error('This should never be called');
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

    try {
      const result = await subscriptionService.createSubscription(
        organizationId,
        validatedBody,
        user,
        c.req.header() as Record<string, string>,
      );

      return response.created(c, result);
    } catch (error) {
      const errorMessage
        = error instanceof Error ? error.message : 'Failed to create subscription';
      return response.badRequest(c, errorMessage);
    }
  },
);

// Register OpenAPI route for documentation only
subscriptionsApp.openapi(routes.createSubscriptionRoute, async () => {
  throw new Error('This should never be called');
});

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

    try {
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
      const subscriptionId = (currentSub.subscription as { id: string }).id;

      const result = await subscriptionService.cancelSubscription(
        subscriptionId,
        organizationId,
        validatedBody,
        user,
        c.req.header() as Record<string, string>,
      );

      return response.ok(c, result);
    } catch (error) {
      const errorMessage
        = error instanceof Error ? error.message : 'Failed to cancel subscription';
      return response.badRequest(c, errorMessage);
    }
  },
);

// Register OpenAPI route for documentation only
subscriptionsApp.openapi(routes.cancelSubscriptionRoute, async () => {
  throw new Error('This should never be called');
});

/**
 * GET /api/subscriptions/:subscriptionId
 * Get subscription by ID
 */
subscriptionsApp.get(
  '/:subscriptionId',
  validateParams(
    subscriptionValidations.subscriptionIdParamSchema,
    'Invalid subscription ID',
  ),
  async (c) => {
    const user = c.get('user')!;
    const organizationId = c.get('activeOrganizationId');
    const validatedParams = c.get('validatedParams');

    if (!organizationId) {
      return response.badRequest(
        c,
        'No active organization. Please select an organization first.',
      );
    }

    try {
      const result = await subscriptionService.getSubscriptionById(
        validatedParams.subscriptionId,
        organizationId,
        user,
        c.req.header() as Record<string, string>,
      );

      return response.ok(c, {
        subscription: result.subscription
          ? {
            ...(result.subscription as Record<string, unknown>),
            lineItems: result.lineItems,
            events: result.events,
          }
          : null,
      });
    } catch (error) {
      const errorMessage
        = error instanceof Error ? error.message : 'Failed to fetch subscription';
      if (errorMessage.includes('not found')) {
        return response.notFound(c, errorMessage);
      }
      return response.internalServerError(c, errorMessage);
    }
  },
);

// Register OpenAPI route for documentation only
subscriptionsApp.openapi(routes.getSubscriptionByIdRoute, async () => {
  throw new Error('This should never be called');
});

export default subscriptionsApp;

