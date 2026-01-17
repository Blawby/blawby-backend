import { OpenAPIHono } from '@hono/zod-openapi';

import {
  createConnectedAccountRoute,
  getOnboardingStatusRoute,
} from '@/modules/onboarding/routes';
import {
  getOnboardingStatus,
  createConnectedAccount,
} from '@/modules/onboarding/services/onboarding.service';
import {
  organizationIdParamSchema,
  createConnectedAccountSchema,
} from '@/modules/onboarding/validations/onboarding.validation';

import { validateParams, validateJson } from '@/shared/middleware/validation';
import { registerOpenApiRoutes } from '@/shared/router/openapi-docs';
import type { AppContext } from '@/shared/types/hono';
import { response } from '@/shared/utils/responseUtils';

const onboardingApp = new OpenAPIHono<AppContext>();

/**
 * GET /api/onboarding/organization/:organizationId/status
 * Get onboarding status for organization
 */
onboardingApp.get('/organization/:organizationId/status', validateParams(organizationIdParamSchema, 'Invalid Organization ID'), async (c) => {
  const user = c.get('user')!;
  const validatedParams = c.get('validatedParams');

  const status = await getOnboardingStatus(validatedParams.organizationId,
    user,
    c.req.header() as Record<string, string>);

  if (!status) {
    return response.notFound(c, 'Onboarding status not found');
  }

  return response.ok(c, status);
});


/**
 * POST /api/onboarding/connected-accounts
 * Create connected account for organization (includes session creation)
 */
onboardingApp.post('/connected-accounts', validateJson(createConnectedAccountSchema, 'Invalid Connected Account Data'), async (c) => {
  const user = c.get('user')!; // Auth middleware guarantees user is non-null
  const validatedBody = c.get('validatedBody');

  const details = await createConnectedAccount({
    email: validatedBody.practice_email,
    organizationId: validatedBody.practice_uuid,
    user,
    refreshUrl: validatedBody.refresh_url,
    returnUrl: validatedBody.return_url,
    requestHeaders: c.req.header() as Record<string, string>,
  });

  if (!details.url) {
    return response.internalServerError(c, 'Failed to create connected account');
  }

  return response.created(c, details);
});

registerOpenApiRoutes(onboardingApp, [
  getOnboardingStatusRoute,
  createConnectedAccountRoute,
]);

export default onboardingApp;
