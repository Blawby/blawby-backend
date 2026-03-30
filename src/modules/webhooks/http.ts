import { OpenAPIHono } from '@hono/zod-openapi';
import { getLogger } from '@logtape/logtape';
import type { Context } from 'hono';
import {
  onboardingWebhooksService,
  WebhookVerificationError,
  type StoredWebhookVerificationResult,
} from '@/modules/webhooks/services/onboarding-webhooks.service';
import { injectAbility } from '@/shared/middleware/inject-ability';
import { queueManager } from '@/shared/queue/queue.manager';
import type { AppContext } from '@/shared/types/hono';
import { sendError } from '@/shared/utils/responseUtils';

const logger = getLogger(['webhooks', 'http']);
const webhooksApp = new OpenAPIHono<AppContext>();
webhooksApp.use('*', injectAbility());

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
  ) => Promise<StoredWebhookVerificationResult>
): Promise<Response> => {
  const signature = c.req.header('stripe-signature');
  const body = Buffer.from(await c.req.arrayBuffer());
  const { url } = c.req;

  if (!signature) {
    logger.warn('Missing stripe-signature header in webhook request');
    return sendError(c, {
      code: 'BAD_REQUEST',
      message: 'Missing stripe-signature header',
      status: 400,
    });
  }

  try {
    // 1. Verify signature and store event in database
    const { event, alreadyProcessed, webhookId } = await verifyFn(body, signature, c.req.header(), url);

    if (alreadyProcessed) {
      logger.info('Webhook already processed: {eventId}', { eventId: event.id });
      return c.json({ received: true }, 200);
    }

    if (!webhookId) {
      logger.error('Failed to queue webhook job: Missing webhookId for {eventId}', { eventId: event.id });
      return sendError(c, {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to queue webhook job',
        status: 500,
      });
    }

    // 2. Process asynchronously via Graphile Worker
    // Process-stripe-webhook handles both onboarding events and account events
    await queueManager.addWebhookJob(webhookId, event.id, event.type);

    logger.info('Webhook received and queued: {eventId} ({eventType})', {
      eventId: event.id,
      eventType: event.type,
      webhookId,
    });

    return c.json({ received: true }, 200);
  } catch (err) {
    if (err instanceof WebhookVerificationError) {
      logger.error('Webhook verification failed: {error}', { error: err.message });
      return sendError(c, {
        code: err.status === 400 ? 'BAD_REQUEST' : 'INTERNAL_SERVER_ERROR',
        message: err.message,
        status: err.status,
      });
    }

    logger.error('Unexpected error processing webhook: {error}', {
      error: err instanceof Error ? err.message : 'Unknown error',
    });
    return sendError(c, {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Failed to process webhook',
      status: 500,
    });
  }
};

/**
 * POST /api/webhooks/stripe/connected-accounts
 * Dedicated endpoint for Stripe Connect webhooks (using different signing secret)
 */
webhooksApp.post('/stripe/connected-accounts', async (c) =>
  handleWebhook(c, (body, sig, headers, url) => onboardingWebhooksService.verifyAndStore(body, sig, headers, url))
);

/**
 * POST /api/webhooks/stripe/account
 * Dedicated endpoint for main Stripe webhooks (payments, invoices, etc.)
 * Uses STRIPE_WEBHOOK_SECRET for signature verification
 */
webhooksApp.post('/stripe/account', async (c) =>
  handleWebhook(c, (body, sig, headers, url) =>
    onboardingWebhooksService.verifyAndStoreAccount(body, sig, headers, url)
  )
);

export default webhooksApp;
