import { AppRouteHandler } from '@/shared/types/hono';
import { response } from '@/shared/utils/responseUtils';
import * as subscriptionService from '@/modules/subscriptions/services/subscription.service';
import type { Subscription } from '@/modules/subscriptions/types/subscription.types';
import {
  listPlansRoute,
  getCurrentSubscriptionRoute,
  createSubscriptionRoute,
  cancelSubscriptionRoute,
} from '@/modules/subscriptions/routes';

export const listPlansHandler: AppRouteHandler<typeof listPlansRoute> = async (c) => {
  const plans = await subscriptionService.listPlans();
  return response.ok(c, { plans });
};

export const getCurrentSubscriptionHandler: AppRouteHandler<typeof getCurrentSubscriptionRoute> = async (c) => {
  const user = c.get('user')!;
  const organizationId = c.get('activeOrganizationId');

  if (!organizationId) {
    return response.badRequest(c, 'No active organization. Please select an organization first.');
  }

  const result = await subscriptionService.getCurrentSubscription(
    organizationId,
    user,
    c.req.header() as Record<string, string>,
  );

  if (!result.subscription) {
    return response.ok(c, { subscription: null });
  }

  return response.ok(c, {
    subscription: {
      ...result.subscription as any,
      lineItems: result.lineItems,
      events: result.events,
    },
  });
};

export const createSubscriptionHandler: AppRouteHandler<typeof createSubscriptionRoute> = async (c) => {
  const user = c.get('user')!;
  const organizationId = c.get('activeOrganizationId');
  const validatedBody = c.req.valid('json');

  if (!organizationId) {
    return response.badRequest(c, 'No active organization. Please select an organization first.');
  }

  const result = await subscriptionService.createSubscription(
    organizationId,
    validatedBody,
    user,
    c.req.header() as Record<string, string>,
  );

  return response.created(c, result as any);
};

export const cancelSubscriptionHandler: AppRouteHandler<typeof cancelSubscriptionRoute> = async (c) => {
  const user = c.get('user')!;
  const organizationId = c.get('activeOrganizationId');
  const validatedBody = c.req.valid('json');

  if (!organizationId) {
    return response.badRequest(c, 'No active organization. Please select an organization first.');
  }

  // Get current subscription to find subscription ID
  const currentSub = await subscriptionService.getCurrentSubscription(
    organizationId,
    user,
    c.req.header() as Record<string, string>,
  );

  if (!currentSub.subscription) {
    return response.notFound(c, 'No active subscription found');
  }

  // Extract subscription ID from Better Auth subscription object
  const subscription = currentSub.subscription as Subscription;
  const subscriptionId = subscription.id;

  const result = await subscriptionService.cancelSubscription(
    subscriptionId,
    organizationId,
    validatedBody,
    user,
    c.req.header() as Record<string, string>,
  );

  return response.ok(c, result as any);
};
