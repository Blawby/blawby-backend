import { OpenAPIHono } from '@hono/zod-openapi';
import * as routes from '@/modules/subscriptions/routes';
import * as handlers from '@/modules/subscriptions/handlers';
import { registerOpenApiRoutes } from '@/shared/router/openapi-docs';
import type { AppContext } from '@/shared/types/hono';

const subscriptionsApp = new OpenAPIHono<AppContext>();

/**
 * GET /api/subscriptions/plans
 */
subscriptionsApp.openapi(routes.listPlansRoute, handlers.listPlansHandler);

/**
 * GET /api/subscriptions/current
 */
subscriptionsApp.openapi(routes.getCurrentSubscriptionRoute, handlers.getCurrentSubscriptionHandler);

/**
 * POST /api/subscriptions/create
 */
subscriptionsApp.openapi(routes.createSubscriptionRoute, handlers.createSubscriptionHandler);

/**
 * POST /api/subscriptions/cancel
 */
subscriptionsApp.openapi(routes.cancelSubscriptionRoute, handlers.cancelSubscriptionHandler);

registerOpenApiRoutes(subscriptionsApp, routes);

export default subscriptionsApp;
