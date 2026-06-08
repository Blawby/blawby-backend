import { subscriptionRepository } from '@/modules/subscriptions/database/queries/subscription.repository';
// oxlint-disable-next-line import/no-namespace
import * as schema from '@/schema';
import { createBetterAuthInstance } from '@/shared/auth/better-auth';
import { db } from '@/shared/database';
import { getActiveTx } from '@/shared/database/uow';
import type { ServiceContext } from '@/shared/types/service-context';
import { getStripeInstance } from '@/shared/utils/stripe-client';
import { getLogger } from '@logtape/logtape';
import { and, eq, inArray } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';

const logger = getLogger(['subscriptions', 'services', 'checkout-session']);

const generateSlug = (name: string): string =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 50);

const isMissingStripeCustomerError = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const stripeError = error as { code?: unknown; message?: unknown };
  return (
    stripeError.code === 'resource_missing' &&
    typeof stripeError.message === 'string' &&
    stripeError.message.includes('No such customer')
  );
};

const createStripeCustomerForOrganization = async (
  organizationId: string,
  email: string | undefined
): Promise<string> => {
  const stripe = getStripeInstance();
  const customer = await stripe.customers.create({
    email,
    metadata: { organization_id: organizationId },
  });

  await db
    .update(schema.organizations)
    .set({ stripeCustomerId: customer.id })
    .where(eq(schema.organizations.id, organizationId));
  return customer.id;
};

const updateLocalSubscriptionCustomer = async (subscriptionId: string, stripeCustomerId: string): Promise<void> => {
  await db
    .update(schema.subscriptions)
    .set({ stripeCustomerId, updatedAt: new Date() })
    .where(eq(schema.subscriptions.id, subscriptionId));
};

const getOrCreateOrg = async (
  userId: string,
  requestHeaders: Headers
): Promise<{ organizationId: string; isNew: boolean }> => {
  const memberships = await getActiveTx()
    .select({ organizationId: schema.members.organizationId })
    .from(schema.members)
    .where(eq(schema.members.userId, userId));

  if (memberships.length === 0) {
    const [userData] = await getActiveTx()
      .select({ name: schema.users.name })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);

    if (!userData) {
      throw new HTTPException(404, { message: 'User not found' });
    }

    const orgName = `${userData.name}'s org`;
    let orgSlug = generateSlug(userData.name);

    const candidates = Array.from({ length: 10 }, (_, i) => (i === 0 ? orgSlug : `${orgSlug}-${i}`));
    const organizationId = crypto.randomUUID();
    let created = false;

    // oxlint-disable-next-line no-await-in-loop
    for (const candidateSlug of candidates) {
      try {
        await db.transaction(async (tx) => {
          await tx
            .insert(schema.organizations)
            .values({ id: organizationId, name: orgName, slug: candidateSlug, createdAt: new Date() });
          await tx
            .insert(schema.members)
            .values({ id: crypto.randomUUID(), userId, organizationId, role: 'owner', createdAt: new Date() });
        });
        orgSlug = candidateSlug;
        created = true;
        break;
      } catch (err) {
        const code =
          typeof err === 'object' && err !== null && 'code' in err ? (err as { code: unknown }).code : undefined;
        if (code !== '23505') {
          throw err;
        }
      }
    }
    if (!created) {
      throw new HTTPException(500, { message: 'Unable to generate unique organization slug' });
    }

    await createBetterAuthInstance(db).api.setActiveOrganization({
      body: { organizationId },
      headers: requestHeaders,
    });

    return { organizationId, isNew: true };
  }

  // Find org without active subscription (prefer that), else first org
  const orgIds = memberships.map((m) => m.organizationId);
  const orgs = await getActiveTx()
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
    requireManagementAccess = true,
  } = params;

  // 1. Resolve price — must exist and be active
  const price = await subscriptionRepository.findPriceByStripeId(stripePriceId);
  if (!price) {
    throw new HTTPException(400, { message: `Price not found: ${stripePriceId}` });
  }
  if (!price.is_active) {
    throw new HTTPException(400, { message: `Price is not active: ${stripePriceId}` });
  }

  // 2. Resolve org
  let organizationId = '';
  let resolvedMember: { role: string | null } | undefined = undefined;
  if (explicitOrgId) {
    const [org] = await getActiveTx()
      .select({ id: schema.organizations.id })
      .from(schema.organizations)
      .where(eq(schema.organizations.id, explicitOrgId))
      .limit(1);

    if (!org) {
      throw new HTTPException(404, { message: 'Organization not found' });
    }

    const [member] = await getActiveTx()
      .select({ role: schema.members.role })
      .from(schema.members)
      .where(and(eq(schema.members.userId, ctx.userId), eq(schema.members.organizationId, explicitOrgId)))
      .limit(1);

    if (!member) {
      throw new HTTPException(403, { message: 'Not a member of this organization' });
    }

    resolvedMember = member;
    organizationId = explicitOrgId;
  } else {
    const resolved = await getOrCreateOrg(ctx.userId, new Headers(ctx.requestHeaders));
    ({ organizationId } = resolved);
  }

  if (requireManagementAccess) {
    const member =
      resolvedMember ??
      (
        await getActiveTx()
          .select({ role: schema.members.role })
          .from(schema.members)
          .where(and(eq(schema.members.userId, ctx.userId), eq(schema.members.organizationId, organizationId)))
          .limit(1)
      )[0];

    if (!member || !['owner', 'admin'].includes(member.role ?? '')) {
      throw new HTTPException(403, { message: 'Not permitted to manage subscriptions for this organization' });
    }
  }

  // 3. Guard duplicate active subscription
  const [org] = await getActiveTx()
    .select({ activeSubscriptionId: schema.organizations.activeSubscriptionId })
    .from(schema.organizations)
    .where(eq(schema.organizations.id, organizationId))
    .limit(1);

  if (org?.activeSubscriptionId) {
    const [activeSub] = await getActiveTx()
      .select({ status: schema.subscriptions.status })
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.id, org.activeSubscriptionId))
      .limit(1);

    if (activeSub?.status === 'active' || activeSub?.status === 'trialing') {
      throw new HTTPException(409, { message: 'Organization already has an active subscription' });
    }
  }

  // 4. Get or create Stripe customer
  const [orgData] = await getActiveTx()
    .select({ stripeCustomerId: schema.organizations.stripeCustomerId })
    .from(schema.organizations)
    .where(eq(schema.organizations.id, organizationId))
    .limit(1);

  let stripeCustomerId = orgData?.stripeCustomerId ?? null;

  const stripe = getStripeInstance();
  if (!stripeCustomerId) {
    stripeCustomerId = await createStripeCustomerForOrganization(organizationId, ctx.user?.email ?? undefined);
  } else if (ctx.user?.email) {
    try {
      // Ensure existing customers have email set for checkout prefill
      await stripe.customers.update(stripeCustomerId, { email: ctx.user.email });
    } catch (error) {
      if (!isMissingStripeCustomerError(error)) {
        throw error;
      }

      logger.warn(
        'Stored Stripe customer {stripeCustomerId} was missing; creating replacement for org {organizationId}',
        {
          stripeCustomerId,
          organizationId,
        }
      );
      stripeCustomerId = await createStripeCustomerForOrganization(organizationId, ctx.user.email);
    }
  }

  // 5. Atomically find-or-create the incomplete subscription row so retries share
  // The same subscriptionId and thus the same Stripe idempotency key.
  const planName = price.name ?? stripePriceId;
  const { subscriptionId, isNew } = await db.transaction(async (tx) => {
    const [existingIncomplete] = await tx
      .select({ id: schema.subscriptions.id })
      .from(schema.subscriptions)
      .where(
        and(
          eq(schema.subscriptions.referenceId, organizationId),
          eq(schema.subscriptions.status, 'incomplete'),
          eq(schema.subscriptions.plan, planName)
        )
      )
      .limit(1);

    if (existingIncomplete) {
      await tx
        .update(schema.subscriptions)
        .set({ stripeCustomerId, updatedAt: new Date() })
        .where(eq(schema.subscriptions.id, existingIncomplete.id));
      return { subscriptionId: existingIncomplete.id, isNew: false };
    }

    const newId = crypto.randomUUID();
    await tx.insert(schema.subscriptions).values({
      id: newId,
      plan: planName,
      referenceId: organizationId,
      stripeCustomerId,
      status: 'incomplete',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    return { subscriptionId: newId, isNew: true };
  });

  // 6. Create Stripe Checkout Session
  let checkoutUrl: string | null = null;

  const createStripeCheckoutSession = async (customerId: string) =>
    await stripe.checkout.sessions.create(
      {
        mode: 'subscription',
        customer: customerId,
        line_items: [{ price: stripePriceId, ...(price.usage_type !== 'metered' ? { quantity: 1 } : {}) }],
        subscription_data: {
          metadata: { organization_id: organizationId, subscription_id: subscriptionId },
        },
        success_url: successUrl,
        cancel_url: cancelUrl,
      },
      { idempotencyKey: `checkout_create:${organizationId}:${subscriptionId}:${customerId}` }
    );

  try {
    const session = await createStripeCheckoutSession(stripeCustomerId);
    checkoutUrl = session.url;
  } catch (err) {
    if (isMissingStripeCustomerError(err)) {
      logger.warn(
        'Stripe customer {stripeCustomerId} was missing while creating checkout; creating replacement for org {organizationId}',
        {
          stripeCustomerId,
          organizationId,
        }
      );

      stripeCustomerId = await createStripeCustomerForOrganization(organizationId, ctx.user?.email ?? undefined);
      await updateLocalSubscriptionCustomer(subscriptionId, stripeCustomerId);

      try {
        const session = await createStripeCheckoutSession(stripeCustomerId);
        checkoutUrl = session.url;
      } catch (retryErr) {
        if (isNew) {
          await db.delete(schema.subscriptions).where(eq(schema.subscriptions.id, subscriptionId));
        }
        logger.error('Failed to create Stripe checkout session after customer replacement: {error}', {
          error: retryErr,
        });
        throw new HTTPException(500, { message: 'Failed to create checkout session' });
      }
    } else {
      // Roll back the local subscription row only if we just created it
      if (isNew) {
        await db.delete(schema.subscriptions).where(eq(schema.subscriptions.id, subscriptionId));
      }
      logger.error('Failed to create Stripe checkout session: {error}', { error: err });
      throw new HTTPException(500, { message: 'Failed to create checkout session' });
    }
  }

  if (!checkoutUrl) {
    // Roll back the local subscription row only if we just created it
    if (isNew) {
      await db.delete(schema.subscriptions).where(eq(schema.subscriptions.id, subscriptionId));
    }
    throw new HTTPException(500, { message: 'Failed to create checkout session' });
  }

  logger.info('Created checkout session for org {organizationId}, subscription {subscriptionId}', {
    organizationId,
    subscriptionId,
  });

  return { subscriptionId, url: checkoutUrl };
};
