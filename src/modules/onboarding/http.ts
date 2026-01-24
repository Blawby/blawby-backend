import { OpenAPIHono } from '@hono/zod-openapi';
import * as routes from '@/modules/onboarding/routes';
import * as handlers from '@/modules/onboarding/http.handlers';
import { registerOpenApiRoutes } from '@/shared/router/openapi-docs';
import type { AppContext } from '@/shared/types/hono';

import { createHonoApp } from '@/shared/router/factory';

const onboardingApp = createHonoApp();

/**
 * GET /api/onboarding/organization/:organizationId/status
 * Get onboarding status for organization
 */
onboardingApp.openapi(routes.getOnboardingStatusRoute, handlers.getOnboardingStatusHandler);

/**
 * POST /api/onboarding/connected-accounts
 * Create connected account for organization (includes session creation)
 */
onboardingApp.openapi(routes.createConnectedAccountRoute, handlers.createConnectedAccountHandler);

registerOpenApiRoutes(onboardingApp, [
  routes.getOnboardingStatusRoute,
  routes.createConnectedAccountRoute,
]);

export default onboardingApp;
