import { ForbiddenError } from '@casl/ability';
import { HTTPException } from 'hono/http-exception';
import { eq } from 'drizzle-orm';
import * as schema from '@/schema';
import { db } from '@/shared/database';
import { getStripeInstance } from '@/shared/utils/stripe-client';
import type { ServiceContext } from '@/shared/types/service-context';

export interface BillingPortalRequest {
  returnUrl: string;
  immediately?: boolean;
}

export const createBillingPortalSession = async (
  params: BillingPortalRequest,
  ctx: ServiceContext
): Promise<{ url: string; redirect: boolean }> => {
  const { returnUrl, immediately = false } = params;
  const { organizationId } = ctx;

  ForbiddenError.from(ctx.ability).throwUnlessCan('manage', 'Subscription');

  if (!organizationId) {
    throw new HTTPException(400, { message: 'No active organization' });
  }

  // 1. Fetch org's active subscription
  const [org] = await db
    .select({
      stripeCustomerId: schema.organizations.stripeCustomerId,
      activeSubscriptionId: schema.organizations.activeSubscriptionId,
    })
    .from(schema.organizations)
    .where(eq(schema.organizations.id, organizationId))
    .limit(1);

  if (!org?.activeSubscriptionId) {
    throw new HTTPException(400, { message: 'No active subscription found for this organization' });
  }

  const [sub] = await db
    .select({ stripeSubscriptionId: schema.subscriptions.stripeSubscriptionId })
    .from(schema.subscriptions)
    .where(eq(schema.subscriptions.id, org.activeSubscriptionId))
    .limit(1);

  if (!sub?.stripeSubscriptionId) {
    throw new HTTPException(400, { message: 'Subscription not yet synced with Stripe' });
  }

  const stripeCustomerId = org.stripeCustomerId;
  if (!stripeCustomerId) {
    throw new HTTPException(400, { message: 'No Stripe customer found for this organization' });
  }

  // 2. Create billing portal session
  const stripe = getStripeInstance();
  const session = await stripe.billingPortal.sessions.create({
    customer: stripeCustomerId,
    return_url: returnUrl,
  });

  return { url: session.url, redirect: !immediately };
};
