import { getLogger } from '@logtape/logtape';
import { HTTPException } from 'hono/http-exception';
import { and, eq, inArray } from 'drizzle-orm';
import { subscriptionRepository } from '@/modules/subscriptions/database/queries/subscription.repository';
import * as schema from '@/schema';
import { createBetterAuthInstance } from '@/shared/auth/better-auth';
import { db } from '@/shared/database';
import { getStripeInstance } from '@/shared/utils/stripe-client';
import type { ServiceContext } from '@/shared/types/service-context';

const logger = getLogger(['subscriptions', 'services', 'checkout-session']);

const generateSlug = (name: string): string =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 50);

const getOrCreateOrg = async (
  userId: string,
  requestHeaders: Headers
): Promise<{ organizationId: string; isNew: boolean }> => {
  const memberships = await db
    .select({ organizationId: schema.members.organizationId })
    .from(schema.members)
    .where(eq(schema.members.userId, userId));

  if (memberships.length === 0) {
    const [userData] = await db
      .select({ name: schema.users.name })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);

    if (!userData) {
      throw new HTTPException(404, { message: 'User not found' });
    }

    const orgName = `${userData.name}'s org`;
    let orgSlug = generateSlug(userData.name);

    let slugFound = false;
    for (let i = 0; i < 10; i++) {
      const candidate = i === 0 ? orgSlug : `${orgSlug}-${i}`;
      const [existing] = await db
        .select({ id: schema.organizations.id })
        .from(schema.organizations)
        .where(eq(schema.organizations.slug, candidate))
        .limit(1);
      if (!existing) {
        orgSlug = candidate;
        slugFound = true;
        break;
      }
    }
    if (!slugFound) {
      throw new HTTPException(500, { message: 'Unable to generate unique organization slug' });
    }

    const organizationId = crypto.randomUUID();
    await db.transaction(async (tx) => {
      await tx
        .insert(schema.organizations)
        .values({ id: organizationId, name: orgName, slug: orgSlug, createdAt: new Date() });
      await tx
        .insert(schema.members)
        .values({ id: crypto.randomUUID(), userId, organizationId, role: 'owner', createdAt: new Date() });
    });

    await createBetterAuthInstance(db).api.setActiveOrganization({
      body: { organizationId },
      headers: requestHeaders,
    });

    return { organizationId, isNew: true };
  }

  // Find org without active subscription (prefer that), else first org
  const orgIds = memberships.map((m) => m.organizationId);
  const orgs = await db
    .select({ id: schema.organizations.id, activeSubscriptionId: schema.organizations.activeSubscriptionId })
    .from(schema.organizations)
    .where(inArray(schema.organizations.id, orgIds));

  const orgWithoutSub = orgs.find((o) => !o.activeSubscriptionId);
  const organizationId = orgWithoutSub?.id ?? orgs[0]?.id;

  if (!organizationId) {
    throw new HTTPException(500, { message: 'Failed to resolve organization' });
  }

  return { organizationId, isNew: false };
};

export interface CheckoutSessionRequest {
  stripePriceId: string;
  successUrl: string;
  cancelUrl: string;
  disableRedirect?: boolean;
  organizationId?: string;
  requireManagementAccess?: boolean;
}

export const createCheckoutSession = async (
  params: CheckoutSessionRequest,
  ctx: ServiceContext
): Promise<{ subscriptionId: string; url: string | null }> => {
  const {
    stripePriceId,
    successUrl,
    cancelUrl,
    organizationId: explicitOrgId,
    requireManagementAccess = false,
  } = params;

  // 1. Resolve price — must exist and be active
  const price = await subscriptionRepository.findPriceByStripeId(db, stripePriceId);
  if (!price) {
    throw new HTTPException(400, { message: `Price not found: ${stripePriceId}` });
  }
  if (!price.is_active) {
    throw new HTTPException(400, { message: `Price is not active: ${stripePriceId}` });
  }

  // 2. Resolve org
  let organizationId: string;
  if (explicitOrgId) {
    const [org] = await db
      .select({ id: schema.organizations.id })
      .from(schema.organizations)
      .where(eq(schema.organizations.id, explicitOrgId))
      .limit(1);

    if (!org) {
      throw new HTTPException(404, { message: 'Organization not found' });
    }

    const [member] = await db
      .select({ role: schema.members.role })
      .from(schema.members)
      .where(and(eq(schema.members.userId, ctx.userId), eq(schema.members.organizationId, explicitOrgId)))
      .limit(1);

    if (!member) {
      throw new HTTPException(403, { message: 'Not a member of this organization' });
    }

    organizationId = explicitOrgId;
  } else {
    const resolved = await getOrCreateOrg(ctx.userId, ctx.requestHeaders as unknown as Headers);
    organizationId = resolved.organizationId;
  }

  if (requireManagementAccess) {
    const [member] = await db
      .select({ role: schema.members.role })
      .from(schema.members)
      .where(and(eq(schema.members.userId, ctx.userId), eq(schema.members.organizationId, organizationId)))
      .limit(1);

    if (!member || !['owner', 'admin'].includes(member.role ?? '')) {
      throw new HTTPException(403, { message: 'Not permitted to manage subscriptions for this organization' });
    }
  }

  // 3. Guard duplicate active subscription
  const [org] = await db
    .select({ activeSubscriptionId: schema.organizations.activeSubscriptionId })
    .from(schema.organizations)
    .where(eq(schema.organizations.id, organizationId))
    .limit(1);

  if (org?.activeSubscriptionId) {
    const [activeSub] = await db
      .select({ status: schema.subscriptions.status })
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.id, org.activeSubscriptionId))
      .limit(1);

    if (activeSub?.status === 'active' || activeSub?.status === 'trialing') {
      throw new HTTPException(409, { message: 'Organization already has an active subscription' });
    }
  }

  // 4. Get or create Stripe customer
  const [orgData] = await db
    .select({ stripeCustomerId: schema.organizations.stripeCustomerId })
    .from(schema.organizations)
    .where(eq(schema.organizations.id, organizationId))
    .limit(1);

  let stripeCustomerId = orgData?.stripeCustomerId ?? null;

  const stripe = getStripeInstance();
  if (!stripeCustomerId) {
    const customer = await stripe.customers.create({
      email: ctx.user?.email ?? undefined,
      metadata: { organization_id: organizationId },
    });
    stripeCustomerId = customer.id;
    await db.update(schema.organizations).set({ stripeCustomerId }).where(eq(schema.organizations.id, organizationId));
  } else if (ctx.user?.email) {
    // Ensure existing customers have email set for checkout prefill
    await stripe.customers.update(stripeCustomerId, { email: ctx.user.email });
  }

  // 5. Insert local subscription row (status: 'incomplete' until webhook confirms)
  const subscriptionId = crypto.randomUUID();
  await db.insert(schema.subscriptions).values({
    id: subscriptionId,
    plan: price.name ?? stripePriceId,
    referenceId: organizationId,
    stripeCustomerId,
    status: 'incomplete',
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  // 6. Create Stripe Checkout Session
  let checkoutUrl: string | null = null;

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: stripeCustomerId,
      line_items: [{ price: stripePriceId, ...(price.usage_type !== 'metered' ? { quantity: 1 } : {}) }],
      subscription_data: {
        metadata: { organization_id: organizationId, subscription_id: subscriptionId },
      },
      success_url: successUrl,
      cancel_url: cancelUrl,
    });
    checkoutUrl = session.url;
  } catch (err) {
    // Roll back the local subscription row since no checkout was created
    await db.delete(schema.subscriptions).where(eq(schema.subscriptions.id, subscriptionId));
    logger.error('Failed to create Stripe checkout session: {error}', { error: err });
    throw new HTTPException(500, { message: 'Failed to create checkout session' });
  }

  logger.info('Created checkout session for org {organizationId}, subscription {subscriptionId}', {
    organizationId,
    subscriptionId,
  });

  return { subscriptionId, url: checkoutUrl };
};
