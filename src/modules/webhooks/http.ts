import { OpenAPIHono } from '@hono/zod-openapi';
import { getLogger } from '@logtape/logtape';
import type { Context } from 'hono';
import type Stripe from 'stripe';
import { onboardingWebhooksService } from '@/modules/webhooks/services/onboarding-webhooks.service';
import { addWebhookJob } from '@/shared/queue/queue.manager';
import type { AppContext } from '@/shared/types/hono';
import type { Result } from '@/shared/types/result';
import { response } from '@/shared/utils/responseUtils';

const logger = getLogger(['webhooks', 'http']);
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
    url: string
  ) => Promise<
    Result<{
      event: Stripe.Event;
      alreadyProcessed: boolean;
      webhookId?: string;
    }>
  >
): Promise<Response> => {
  const signature = c.req.header('stripe-signature');
  const body = Buffer.from(await c.req.arrayBuffer());
  const {url} = c.req;

  if (!signature) {
    logger.warn('Missing stripe-signature header in webhook request');
    return response.badRequest(c, 'Missing stripe-signature header');
  }

  try {
    // 1. Verify signature and store event in database
    const result = await verifyFn(body, signature, c.req.header(), url);

    if (!result.success) {
      const { error } = result;
      logger.error('Webhook verification failed: {error}', { error: error.message });
      return response.fromResult(c, result);
    }

    const { event, alreadyProcessed, webhookId } = result.data;

    if (alreadyProcessed) {
      logger.info('Webhook already processed: {eventId}', { eventId: event.id });
      return response.ok(c, { received: true });
    }

    if (!webhookId) {
      logger.error('Failed to queue webhook job: Missing webhookId for {eventId}', { eventId: event.id });
      return response.internalServerError(c, 'Failed to queue webhook job');
    }

    // 2. Process asynchronously via Graphile Worker
    // Process-stripe-webhook handles both onboarding events and account events
    await addWebhookJob(webhookId, event.id, event.type);

    logger.info('Webhook received and queued: {eventId} ({eventType})', {
      eventId: event.id,
      eventType: event.type,
      webhookId,
    });

    return response.ok(c, { received: true });
  } catch (err) {
    logger.error('Unexpected error processing webhook: {error}', {
      error: err instanceof Error ? err.message : 'Unknown error',
    });
    return response.internalServerError(c, 'Failed to process webhook');
  }
};

/**
 * POST /api/webhooks/stripe/connected-accounts
 * Dedicated endpoint for Stripe Connect webhooks (using different signing secret)
 */
webhooksApp.post('/stripe/connected-accounts', async (c) => handleWebhook(c, (body, sig, headers, url) =>
    onboardingWebhooksService.verifyAndStore(body, sig, headers, url)
  ));

/**
 * POST /api/webhooks/stripe/account
 * Dedicated endpoint for main Stripe webhooks (payments, invoices, etc.)
 * Uses STRIPE_WEBHOOK_SECRET for signature verification
 */
webhooksApp.post('/stripe/account', async (c) => handleWebhook(c, (body, sig, headers, url) =>
    onboardingWebhooksService.verifyAndStoreAccount(body, sig, headers, url)
  ));

export default webhooksApp;
