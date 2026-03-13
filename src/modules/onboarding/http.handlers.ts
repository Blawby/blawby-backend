import { getOnboardingStatusRoute, createConnectedAccountRoute } from '@/modules/onboarding/routes';
import { onboardingService } from '@/modules/onboarding/services/onboarding.service';
import { AppRouteHandler } from '@/shared/types/hono';
import { getServiceContext } from '@/shared/types/service-context';
import { response } from '@/shared/utils/responseUtils';

export const getOnboardingStatusHandler: AppRouteHandler<typeof getOnboardingStatusRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { practice_id: organizationId } = c.req.valid('param');

  const result = await onboardingService.getOnboardingStatus(
    {
      organizationId,
    },
    ctx
  );

  return response.fromResult(c, result);
};

export const createConnectedAccountHandler: AppRouteHandler<typeof createConnectedAccountRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const validatedBody = c.req.valid('json');

  const result = await onboardingService.createConnectedAccount(
    {
      email: validatedBody.practice_email,
      organizationId: validatedBody.practice_uuid,
      refreshUrl: validatedBody.refresh_url,
      returnUrl: validatedBody.return_url,
    },
    ctx
  );

  return response.fromResult(c, result, 201);
};
