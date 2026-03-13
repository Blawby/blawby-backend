import { handlers } from '@/modules/stripe/handlers';
import { createAccountSessionRoute, getConnectedAccountRoute } from '@/modules/stripe/routes/index';
import { createHonoApp } from '@/shared/router/factory';
import { registerOpenApiRoutes } from '@/shared/router/openapi-docs';

const stripeApp = createHonoApp();

/**
 * POST /api/stripe/connect/account-session
 * Create a Stripe Account Session for embedded components
 */
stripeApp.openapi(createAccountSessionRoute, handlers.createAccountSessionHandler);

/**
 * GET /api/stripe/connect/account/{practice_id}
 * Get connected account metadata and readiness status
 */
stripeApp.openapi(getConnectedAccountRoute, handlers.getConnectedAccountHandler);

registerOpenApiRoutes(stripeApp, [createAccountSessionRoute, getConnectedAccountRoute]);

export default stripeApp;
