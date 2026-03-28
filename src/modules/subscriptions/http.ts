import { handlers } from '@/modules/subscriptions/handlers';
import { routes } from '@/modules/subscriptions/routes';
import { injectAbility } from '@/shared/middleware/inject-ability';
import { createHonoApp } from '@/shared/router/factory';
import { registerOpenApiRoutes } from '@/shared/router/openapi-docs';

const subscriptionsApp = createHonoApp();
subscriptionsApp.use('*', injectAbility());

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
