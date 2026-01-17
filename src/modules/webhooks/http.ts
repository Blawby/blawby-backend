import { OpenAPIHono } from '@hono/zod-openapi';
import type { Context } from 'hono';
import type { AppContext } from '@/shared/types/hono';
import { response } from '@/shared/utils/responseUtils';
import {
  verifyAndStore,
  verifyAndStoreAccount,
} from '@/modules/webhooks/services/onboarding-webhooks.service';
import { addWebhookJob } from '@/shared/queue/queue.manager';
import type Stripe from 'stripe';

const webhooksApp = new OpenAPIHono<AppContext>();

/**
 * Shared webhook handler to reduce code duplication
 * Uses addWebhookJob for both routes since process-stripe-webhook handles
 * both onboarding events and account events (payments, invoices, etc.)
 */
const handleWebhook = async (
  c: Context<AppContext>,
  verifyFn: (
    rawBody: string | Buffer,
    signature: string,
    headers: Record<string, string>,
    url: string,
  ) => Promise<{
    event: Stripe.Event;
    alreadyProcessed: boolean;
    webhookId?: string;
  }>,
): Promise<Response> => {
  const signature = c.req.header('stripe-signature');
  const body = Buffer.from(await c.req.arrayBuffer());

  if (!signature) {
    return response.badRequest(c, 'Missing stripe-signature header');
  }

  try {
    // 1. Verify signature and store event in database
    const { event, alreadyProcessed, webhookId } = await verifyFn(
      body,
      signature,
      c.req.header(),
      c.req.url,
    );

    if (alreadyProcessed) {
      console.log(`Webhook already processed: ${event.id}`);
      return response.ok(c, { received: true });
    }

    if (!webhookId) {
      console.error(`Failed to queue webhook job: Missing webhookId for ${event.id}`);
      return response.internalServerError(c, 'Failed to queue webhook job');
    }

    // 2. Process asynchronously via Graphile Worker
    // process-stripe-webhook handles both onboarding events and account events
    await addWebhookJob(webhookId, event.id, event.type);

    return response.ok(c, { received: true });
  } catch (err) {
    console.error('Webhook processing failed:', err);

    const isValidationError = (err as any).code === 'INVALID_SIGNATURE' || (err as any).code === 'STRIPE_SECRET_MISSING';

    if (isValidationError) {
      return response.badRequest(c, `Webhook Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }

    return response.internalServerError(c, 'Failed to process webhook');
  }
};

/**
 * POST /api/webhooks/stripe/connected-accounts
 * Dedicated endpoint for Stripe Connect webhooks (using different signing secret)
 */
webhooksApp.post('/stripe/connected-accounts', async (c) => {
  return handleWebhook(c, verifyAndStore);
});

/**
 * POST /api/webhooks/stripe/account
 * Dedicated endpoint for main Stripe webhooks (payments, invoices, etc.)
 * Uses STRIPE_WEBHOOK_SECRET for signature verification
 */
webhooksApp.post('/stripe/account', async (c) => {
  return handleWebhook(c, verifyAndStoreAccount);
});

export default webhooksApp;
