import { eq } from 'drizzle-orm';
import {
  listPlansRoute,
  getCurrentSubscriptionRoute,
  cancelSubscriptionRoute,
} from '@/modules/subscriptions/routes';
import { subscriptionService } from '@/modules/subscriptions/services/subscription.service';
import { organizations } from '@/schema/better-auth-schema';
import { db } from '@/shared/database';
import { AppRouteHandler } from '@/shared/types/hono';
import { response } from '@/shared/utils/responseUtils';

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

export const cancelSubscriptionHandler: AppRouteHandler<typeof cancelSubscriptionRoute> = async (c) => {
  const user = c.get('user')!;
  const organizationId = c.get('activeOrganizationId');
  const validatedBody = c.req.valid('json');

  if (!organizationId) {
    return response.badRequest(c, 'No active organization. Please select an organization first.');
  }

  const organization = await db.query.organizations.findFirst({
    where: eq(organizations.id, organizationId),
    columns: {
      id: true,
      activeSubscriptionId: true,
    },
  });

  if (!organization) {
    return response.notFound(c, 'Organization not found');
  }


  if (!organization?.activeSubscriptionId) {
    return response.badRequest(c, 'No active subscription found for this organization');
  }

  // Optimize: We delegate subscription lookup to the service to avoid extra queries
  const result = await subscriptionService.cancelSubscription(
    organizationId,
    validatedBody,
    user,
    c.req.header() as Record<string, string>,
  );

  return response.fromResult(c, result);
};
