import type { routes } from '@/modules/subscriptions/routes';
import { subscriptionService } from '@/modules/subscriptions/services/subscription.service';
import type { AppRouteHandler } from '@/shared/types/hono';
import { getServiceContext } from '@/shared/types/service-context';
import { sendResult } from '@/shared/utils/responseUtils';

const listPlansHandler: AppRouteHandler<typeof routes.listPlansRoute> = async (c) => {
  const result = await subscriptionService.listPlans();

  return sendResult(c, result);
};

const getCurrentSubscriptionHandler: AppRouteHandler<typeof routes.getCurrentSubscriptionRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const result = await subscriptionService.getCurrentSubscription({}, ctx);

  return sendResult(c, result);
};

const cancelSubscriptionHandler: AppRouteHandler<typeof routes.cancelSubscriptionRoute> = async (c) => {
  const validatedBody = c.req.valid('json');
  const ctx = getServiceContext(c);
  const result = await subscriptionService.cancelSubscription({ data: validatedBody }, ctx);

  return sendResult(c, result);
};

export const handlers = {
  listPlansHandler,
  getCurrentSubscriptionHandler,
  cancelSubscriptionHandler,
};
