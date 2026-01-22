import { AppRouteHandler } from '@/shared/types/hono';
import { response } from '@/shared/utils/responseUtils';
import { subscriptionService } from '@/modules/subscriptions/services/subscription.service';
import {
  listPlansRoute,
  getCurrentSubscriptionRoute,
  createSubscriptionRoute,
  cancelSubscriptionRoute,
} from '@/modules/subscriptions/routes';

export const listPlansHandler: AppRouteHandler<typeof listPlansRoute> = async (c) => {
  const result = await subscriptionService.listPlans();
  return response.fromResult(c, result);
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

  return response.fromResult(c, result);
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

  return response.fromResult(c, result, 201);
};

export const cancelSubscriptionHandler: AppRouteHandler<typeof cancelSubscriptionRoute> = async (c) => {
  const user = c.get('user')!;
  const organizationId = c.get('activeOrganizationId');
  const validatedBody = c.req.valid('json');

  if (!organizationId) {
    return response.badRequest(c, 'No active organization. Please select an organization first.');
  }

  // Get current subscription to find subscription ID
  const currentSubResult = await subscriptionService.getCurrentSubscription(
    organizationId,
    user,
    c.req.header() as Record<string, string>,
  );

  if (!currentSubResult.success) {
    return response.fromResult(c, currentSubResult);
  }

  if (!currentSubResult.data.subscription) {
    return response.notFound(c, 'No active subscription found');
  }

  const subscriptionId = currentSubResult.data.subscription.id;

  const result = await subscriptionService.cancelSubscription(
    subscriptionId,
    organizationId,
    validatedBody,
    user,
    c.req.header() as Record<string, string>,
  );

  return response.fromResult(c, result);
};
