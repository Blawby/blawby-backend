import {
  getOnboardingStatusRoute,
  createConnectedAccountRoute,
} from '@/modules/onboarding/routes';
import { onboardingService } from '@/modules/onboarding/services/onboarding.service';
import { AppRouteHandler } from '@/shared/types/hono';
import { response } from '@/shared/utils/responseUtils';

export const getOnboardingStatusHandler: AppRouteHandler<typeof getOnboardingStatusRoute> = async (c) => {
  const user = c.get('user')!;
  const { practiceId: organizationId } = c.req.valid('param');

  const result = await onboardingService.getOnboardingStatus(
    organizationId,
    user,
    c.req.header() as Record<string, string>,
  );

  return response.fromResult(c, result);
};

export const createConnectedAccountHandler: AppRouteHandler<typeof createConnectedAccountRoute> = async (c) => {
  const user = c.get('user')!;
  const validatedBody = c.req.valid('json');

  const result = await onboardingService.createConnectedAccount({
    email: validatedBody.practice_email,
    organizationId: validatedBody.practice_uuid,
    user,
    refreshUrl: validatedBody.refresh_url,
    returnUrl: validatedBody.return_url,
    requestHeaders: c.req.header() as Record<string, string>,
  });

  return response.fromResult(c, result, 201);
};
