/**
 * Better Auth compat alias handlers for subscription routes.
 * These handlers are registered BEFORE the Better Auth catch-all in better-auth.http.ts
 * so the frontend SDK can continue calling /api/auth/stripe/* without changes.
 */

import { getLogger } from '@logtape/logtape';
import { HTTPException } from 'hono/http-exception';
import { and, eq } from 'drizzle-orm';
import type { Context } from 'hono';
import { createCheckoutSession } from '@/modules/subscriptions/services/checkout-session.service';
import { createBillingPortalSession } from '@/modules/subscriptions/services/billing-portal.service';
import { processWebhookRequest } from '@/modules/subscriptions/services/stripe-webhook.service';
import { getMatchingFrontendUrl } from '@/shared/utils/env';
import { subscriptionRepository } from '@/modules/subscriptions/database/queries/subscription.repository';
import { members } from '@/schema/better-auth-schema';
import { subscriptions } from '@/modules/subscriptions/database/schema/subscriptions.schema';
import { createBetterAuthInstance } from '@/shared/auth/better-auth';
import { defineAbilityFor } from '@/shared/auth/abilities';
import { db } from '@/shared/database';
import { createServiceContext } from '@/shared/types/service-context';
import type { User } from '@/shared/types/BetterAuth';
import type { AppContext } from '@/shared/types/hono';

const logger = getLogger(['shared', 'auth', 'subscription-compat']);
const COMPAT_SUBSCRIPTION_MANAGERS = new Set(['owner', 'admin']);

const assertCompatSubscriptionManager = (memberRole: string | null): void => {
  if (!memberRole || !COMPAT_SUBSCRIPTION_MANAGERS.has(memberRole)) {
    throw new HTTPException(403, { message: 'Not permitted to manage subscriptions for this organization' });
  }
};

/** Build a minimal ServiceContext from a Better Auth session for compat handlers. */
const buildCompatContext = async (c: Context<AppContext>, organizationId?: string) => {
  const session = await createBetterAuthInstance(db).api.getSession({ headers: c.req.raw.headers });

  if (!session?.user) {
    throw new HTTPException(401, { message: 'Unauthorized' });
  }

  const user = session.user as unknown as User;
  const orgId =
    organizationId ?? (session.session as unknown as { activeOrganizationId?: string }).activeOrganizationId ?? '';

  // Get member role for CASL ability
  let memberRole: string | null = null;
  if (orgId) {
    const [member] = await db
      .select({ role: members.role })
      .from(members)
      .where(and(eq(members.userId, user.id), eq(members.organizationId, orgId)))
      .limit(1);

    if (!member) {
      throw new HTTPException(403, { message: 'Not a member of this organization' });
    }

    memberRole = member?.role ?? null;
  }

  return createServiceContext(
    {
      userId: user.id,
      user,
      organizationId: orgId,
      memberRole,
      ability: defineAbilityFor(memberRole, { userId: user.id, organizationId: orgId }),
      requestHeaders: c.req.header(),
    },
    db
  );
};

/**
 * POST /api/auth/stripe/upgrade-subscription
 * Maps Better Auth SDK body (plan name + annual flag) to our checkout service.
 * Returns { subscriptionId, url } in camelCase for Better Auth client SDK.
 */
const compatUpgradeHandler = async (c: Context<AppContext>) => {
  let body: Record<string, unknown> = {};
  try {
    body = await c.req.json();
  } catch {
    // empty body
  }

  const planName = typeof body.plan === 'string' ? body.plan : null;
  const annual = body.annual === true;
  const referenceId =
    typeof body.referenceId === 'string'
      ? body.referenceId
      : typeof body.reference_id === 'string'
        ? body.reference_id
        : undefined;
  const successUrl =
    typeof body.successUrl === 'string'
      ? body.successUrl
      : typeof body.success_url === 'string'
        ? body.success_url
        : undefined;
  const cancelUrl =
    typeof body.cancelUrl === 'string'
      ? body.cancelUrl
      : typeof body.cancel_url === 'string'
        ? body.cancel_url
        : undefined;
  const disableRedirect = body.disableRedirect === true || body.disable_redirect === true;

  if (!successUrl) {
    throw new HTTPException(400, { message: 'successUrl is required' });
  }

  if (!planName) {
    throw new HTTPException(400, { message: 'plan is required' });
  }

  // Resolve stripe_price_id from plan name + interval
  const interval = annual ? 'year' : 'month';
  const price = await subscriptionRepository.findPriceByNameAndInterval(db, planName, interval);
  let fallback = null;
  if (!price) {
    fallback = await subscriptionRepository.findPriceByName(db, planName);
    if (!fallback) {
      throw new HTTPException(400, { message: `Plan not found: ${planName}` });
    }
    logger.warn('No {interval} price found for plan {planName}, using fallback', { interval, planName });
  }

  const stripePriceId = price?.stripe_price_id ?? fallback?.stripe_price_id;
  if (!stripePriceId) {
    throw new HTTPException(400, { message: `No active price found for plan: ${planName}` });
  }

  const ctx = await buildCompatContext(c, referenceId);
  const result = await createCheckoutSession(
    {
      stripePriceId,
      successUrl,
      cancelUrl: cancelUrl ?? successUrl,
      disableRedirect,
      organizationId: referenceId,
      requireManagementAccess: true,
    },
    ctx
  );

  // Better Auth SDK expects camelCase
  return c.json({ subscriptionId: result.subscriptionId, url: result.url }, 200);
};

/**
 * POST /api/auth/stripe/cancel-subscription
 * Returns { url, redirect } in camelCase for Better Auth client SDK.
 */
const compatCancelHandler = async (c: Context<AppContext>) => {
  let body: Record<string, unknown> = {};
  try {
    body = await c.req.json();
  } catch {
    // empty body
  }

  const referenceId = typeof body.referenceId === 'string' ? body.referenceId : undefined;
  const rawReturnUrl = typeof body.returnUrl === 'string' ? body.returnUrl : '/dashboard';
  const returnUrl = rawReturnUrl.startsWith('http')
    ? rawReturnUrl
    : `${getMatchingFrontendUrl()}${rawReturnUrl.startsWith('/') ? rawReturnUrl : `/${rawReturnUrl}`}`;
  const immediately = body.immediately === true;

  const ctx = await buildCompatContext(c, referenceId);
  assertCompatSubscriptionManager(ctx.memberRole);
  const result = await createBillingPortalSession({ returnUrl, immediately }, ctx);

  return c.json({ url: result.url, redirect: result.redirect }, 200);
};

/**
 * GET /api/auth/stripe/list-subscriptions
 * Returns BetterAuthSubscription[] (camelCase) for SDK compatibility.
 */
const compatListHandler = async (c: Context<AppContext>) => {
  const referenceId = c.req.query('referenceId');
  const ctx = await buildCompatContext(c, referenceId);
  assertCompatSubscriptionManager(ctx.memberRole);
  const orgId = ctx.organizationId;

  if (!orgId) {
    return c.json([], 200);
  }

  const subs = await db.select().from(subscriptions).where(eq(subscriptions.referenceId, orgId));

  // Map to camelCase BetterAuthSubscription shape
  const mapped = subs.map((s) => ({
    id: s.id,
    plan: s.plan,
    referenceId: s.referenceId,
    stripeCustomerId: s.stripeCustomerId,
    stripeSubscriptionId: s.stripeSubscriptionId,
    status: s.status,
    periodStart: s.periodStart,
    periodEnd: s.periodEnd,
    cancelAtPeriodEnd: s.cancelAtPeriodEnd,
    cancelAt: s.cancelAt,
    seats: s.seats,
    trialStart: s.trialStart,
    trialEnd: s.trialEnd,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  }));

  return c.json(mapped, 200);
};

/**
 * POST /api/auth/stripe/webhook
 * Passes through to stripe-webhook.service (same as canonical endpoint).
 */
const compatWebhookHandler = async (c: Context<AppContext>) => {
  const rawBody = await c.req.raw.text();
  const signature = c.req.header('stripe-signature') ?? null;
  try {
    await processWebhookRequest(rawBody, signature, '/api/auth/stripe/webhook');
    return c.json({ received: true }, 200);
  } catch (err) {
    // Signature verification failures return 200 to prevent Stripe retry storms
    if (err instanceof HTTPException && err.status === 400) {
      logger.warn('Webhook signature verification failed: {error}', {
        error: err.message,
      });
      return c.json({ received: true }, 200);
    }
    throw err;
  }
};

export const subscriptionCompatHandlers = {
  compatUpgradeHandler,
  compatCancelHandler,
  compatListHandler,
  compatWebhookHandler,
};
