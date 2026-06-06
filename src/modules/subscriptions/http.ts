import { handlers } from '@/modules/subscriptions/handlers';
import { routes } from '@/modules/subscriptions/routes';
import { injectAbility } from '@/shared/middleware/inject-ability';
import { requireAuth } from '@/shared/middleware/requireAuth';
import { requireOrgMembership } from '@/shared/middleware/requireOrgMembership';
import { createHonoApp } from '@/shared/router/factory';
import { registerOpenApiRoutes } from '@/shared/router/openapi-docs';

const subscriptionsApp = createHonoApp();

const publicApp = createHonoApp();
publicApp.use('*', injectAbility());

/**
 * POST /api/subscriptions/webhook (no auth middleware — signature verified in service)
 */
publicApp.openapi(routes.webhookRoute, handlers.webhookHandler);

const authApp = createHonoApp();
authApp.use('*', requireAuth(), injectAbility());

/**
 * GET /api/subscriptions/plans
 */
authApp.openapi(routes.listPlansRoute, handlers.listPlansHandler);

/**
 * POST /api/subscriptions/checkout
 */
authApp.openapi(routes.checkoutRoute, handlers.checkoutHandler);

const staffApp = createHonoApp();
staffApp.use('*', requireAuth(), requireOrgMembership(), injectAbility());

/**
 * GET /api/subscriptions/current
 */
staffApp.openapi(routes.getCurrentSubscriptionRoute, handlers.getCurrentSubscriptionHandler);

/**
 * POST /api/subscriptions/cancel
 */
staffApp.openapi(routes.cancelSubscriptionRoute, handlers.cancelSubscriptionHandler);

/**
 * POST /api/subscriptions/billing-portal
 */
staffApp.openapi(routes.billingPortalRoute, handlers.billingPortalHandler);

/**
 * GET /api/subscriptions/list
 */
staffApp.openapi(routes.listSubscriptionsRoute, handlers.listSubscriptionsHandler);

subscriptionsApp.route('/', publicApp);
subscriptionsApp.route('/', authApp);
subscriptionsApp.route('/', staffApp);

registerOpenApiRoutes(subscriptionsApp, routes);

export default subscriptionsApp;
