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

/**
 * POST /api/subscriptions/checkout
 */
subscriptionsApp.openapi(routes.checkoutRoute, handlers.checkoutHandler);

/**
 * POST /api/subscriptions/billing-portal
 */
subscriptionsApp.openapi(routes.billingPortalRoute, handlers.billingPortalHandler);

/**
 * GET /api/subscriptions/list
 */
subscriptionsApp.openapi(routes.listSubscriptionsRoute, handlers.listSubscriptionsHandler);

/**
 * POST /api/subscriptions/webhook (no auth middleware — signature verified in service)
 */
subscriptionsApp.openapi(routes.webhookRoute, handlers.webhookHandler);

registerOpenApiRoutes(subscriptionsApp, routes);

export default subscriptionsApp;
