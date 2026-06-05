import { handlers } from '@/modules/onboarding/handlers';
import { createConnectedAccountRoute, getOnboardingStatusRoute } from '@/modules/onboarding/routes';
import { injectAbility } from '@/shared/middleware/inject-ability';
import { requireAuth } from '@/shared/middleware/requireAuth';
import { requireOrgMembership } from '@/shared/middleware/requireOrgMembership';
import { createHonoApp } from '@/shared/router/factory';
import { registerOpenApiRoutes } from '@/shared/router/openapi-docs';

const onboardingApp = createHonoApp();
onboardingApp.use('*', requireAuth(), requireOrgMembership(), injectAbility());

/**
 * GET /api/onboarding/organization/:organizationId/status
 * Get onboarding status for organization
 */
onboardingApp.openapi(getOnboardingStatusRoute, handlers.getOnboardingStatusHandler);

/**
 * POST /api/onboarding/connected-accounts
 * Create connected account for organization (includes session creation)
 */
onboardingApp.openapi(createConnectedAccountRoute, handlers.createConnectedAccountHandler);

registerOpenApiRoutes(onboardingApp, [getOnboardingStatusRoute, createConnectedAccountRoute]);

export default onboardingApp;
