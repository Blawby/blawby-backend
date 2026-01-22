import { OpenAPIHono } from '@hono/zod-openapi';
import * as routes from '@/modules/subscriptions/routes';
import * as handlers from '@/modules/subscriptions/handlers';
import * as subscriptionService from '@/modules/subscriptions/services/subscription.service';
import { registerOpenApiRoutes } from '@/shared/router/openapi-docs';
import type { AppContext } from '@/shared/types/hono';
import { response } from '@/shared/utils/responseUtils';

const subscriptionsApp = new OpenAPIHono<AppContext>();

/**
 * GET /api/subscriptions/plans
 * List all available subscription plans (public endpoint)
 * This doesn't have a route definition in routes.ts that supports the current handler? 
 * Actually listPlansRoute exists.
 */
subscriptionsApp.openapi(routes.listPlansRoute, handlers.listPlansHandler);

/**
 * GET /api/subscriptions/current
 * Get current organization's subscription
 */
subscriptionsApp.openapi(routes.getCurrentSubscriptionRoute, handlers.getCurrentSubscriptionHandler);

/**
 * POST /api/subscriptions/create
 * Create/upgrade subscription
 */
subscriptionsApp.openapi(routes.createSubscriptionRoute, handlers.createSubscriptionHandler);

/**
 * POST /api/subscriptions/cancel
 * Cancel subscription
 */
subscriptionsApp.openapi(routes.cancelSubscriptionRoute, handlers.cancelSubscriptionHandler);

registerOpenApiRoutes(subscriptionsApp, routes);

export default subscriptionsApp;
