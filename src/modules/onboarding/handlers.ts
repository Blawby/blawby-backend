import { AppRouteHandler } from '@/shared/types/hono';
import { response } from '@/shared/utils/responseUtils';
import {
  getOnboardingStatus,
  createConnectedAccount,
} from '@/modules/onboarding/services/onboarding.service';
import {
  getOnboardingStatusRoute,
  createConnectedAccountRoute,
} from '@/modules/onboarding/routes';

export const getOnboardingStatusHandler: AppRouteHandler<typeof getOnboardingStatusRoute> = async (c) => {
  const user = c.get('user')!;
  const { organizationId } = c.req.valid('param');

  const status = await getOnboardingStatus(
    organizationId,
    user,
    c.req.header() as Record<string, string>,
  );

  if (!status) {
    return response.notFound(c, 'Onboarding status not found');
  }

  return response.ok(c, status);
};

export const createConnectedAccountHandler: AppRouteHandler<typeof createConnectedAccountRoute> = async (c) => {
  const user = c.get('user')!; // Auth middleware guarantees user is non-null
  const validatedBody = c.req.valid('json');

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
};
