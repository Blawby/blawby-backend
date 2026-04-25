import type { routes } from '@/modules/subscriptions/routes';
import { subscriptionService } from '@/modules/subscriptions/services/subscription.service';
import type { AppRouteHandler } from '@/shared/types/hono';
import { getServiceContext } from '@/shared/types/service-context';

const listPlansHandler: AppRouteHandler<typeof routes.listPlansRoute> = async (c) => {
  const data = await subscriptionService.listPlans();
  return c.json(data, 200);
};

const getCurrentSubscriptionHandler: AppRouteHandler<typeof routes.getCurrentSubscriptionRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const data = await subscriptionService.getCurrentSubscription({}, ctx);
  return c.json(data, 200);
};

const cancelSubscriptionHandler: AppRouteHandler<typeof routes.cancelSubscriptionRoute> = async (c) => {
  const validatedBody = c.req.valid('json');
  const ctx = getServiceContext(c);
  const data = await subscriptionService.cancelSubscription({ data: validatedBody }, ctx);
  return c.json(data, 200);
};

export const handlers = {
  listPlansHandler,
  getCurrentSubscriptionHandler,
  cancelSubscriptionHandler,
};
