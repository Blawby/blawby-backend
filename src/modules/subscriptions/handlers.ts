import type { routes } from '@/modules/subscriptions/routes';
import { subscriptionService } from '@/modules/subscriptions/services/subscription.service';
import { createCheckoutSession } from '@/modules/subscriptions/services/checkout-session.service';
import { createBillingPortalSession } from '@/modules/subscriptions/services/billing-portal.service';
import { processWebhookRequest } from '@/modules/subscriptions/services/stripe-webhook.service';
import { eq } from 'drizzle-orm';
import { subscriptions } from '@/modules/subscriptions/database/schema/subscriptions.schema';
import { db } from '@/shared/database';
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

const checkoutHandler: AppRouteHandler<typeof routes.checkoutRoute> = async (c) => {
  const body = c.req.valid('json');
  const ctx = getServiceContext(c);
  const result = await createCheckoutSession(
    {
      stripePriceId: body.stripe_price_id,
      successUrl: body.success_url,
      cancelUrl: body.cancel_url,
      disableRedirect: body.disable_redirect,
      organizationId: body.organization_id,
    },
    ctx
  );
  return c.json({ subscription_id: result.subscriptionId, url: result.url }, 200);
};

const billingPortalHandler: AppRouteHandler<typeof routes.billingPortalRoute> = async (c) => {
  const body = c.req.valid('json');
  const ctx = getServiceContext(c);
  const result = await createBillingPortalSession({ returnUrl: body.return_url, immediately: body.immediately }, ctx);
  return c.json(result, 200);
};

const listSubscriptionsHandler: AppRouteHandler<typeof routes.listSubscriptionsRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const subs = await db.select().from(subscriptions).where(eq(subscriptions.referenceId, ctx.organizationId));
  return c.json({ subscriptions: subs }, 200);
};

const webhookHandler: AppRouteHandler<typeof routes.webhookRoute> = async (c) => {
  const rawBody = await c.req.raw.text();
  const signature = c.req.header('stripe-signature') ?? null;
  await processWebhookRequest(rawBody, signature, '/api/subscriptions/webhook');
  return c.json({ received: true }, 200);
};

export const handlers = {
  listPlansHandler,
  getCurrentSubscriptionHandler,
  cancelSubscriptionHandler,
  checkoutHandler,
  billingPortalHandler,
  listSubscriptionsHandler,
  webhookHandler,
};
