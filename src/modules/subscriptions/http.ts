import * as handlers from '@/modules/subscriptions/handlers';
import * as routes from '@/modules/subscriptions/routes';
import { createHonoApp } from '@/shared/router/factory';
import { registerOpenApiRoutes } from '@/shared/router/openapi-docs';

const subscriptionsApp = createHonoApp();

/**
 * GET /api/subscriptions/plans
 */
subscriptionsApp.openapi(routes.listPlansRoute, handlers.listPlansHandler);

/**
 * GET /api/subscriptions/current
 */
subscriptionsApp.openapi(routes.getCurrentSubscriptionRoute, handlers.getCurrentSubscriptionHandler);

/**
 * POST /api/subscriptions/cancel
 */
subscriptionsApp.openapi(routes.cancelSubscriptionRoute, handlers.cancelSubscriptionHandler);

registerOpenApiRoutes(subscriptionsApp, routes);

export default subscriptionsApp;
