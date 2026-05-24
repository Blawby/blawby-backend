import { getLogger } from '@logtape/logtape';
import { HTTPException } from 'hono/http-exception';
import { config } from '@/shared/config';
import { queueManager } from '@/shared/queue/queue.manager';
import { stripeWebhookEventsRepository } from '@/shared/repositories/stripe.webhook-events.repository';
import { getStripeInstance } from '@/shared/utils/stripe-client';

const logger = getLogger(['subscriptions', 'services', 'stripe-webhook']);

const QUEUED_EVENT_PREFIXES = [
  'product.',
  'price.',
  'account.',
  'capability.',
  'payment_intent.',
  'charge.',
  'invoice.',
  'customer.subscription.',
  'checkout.session.',
];

export const processWebhookRequest = async (
  rawBody: string,
  stripeSignature: string | null,
  endpointPath: string = '/api/subscriptions/webhook'
): Promise<void> => {
  const { webhookSecret } = config.stripe;
  if (!webhookSecret) {
    throw new Error('STRIPE_WEBHOOK_SECRET must be configured');
  }

  if (!stripeSignature) {
    throw new HTTPException(400, { message: 'Missing Stripe-Signature header' });
  }

  const stripe = getStripeInstance();

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, stripeSignature, webhookSecret);
  } catch (err) {
    logger.warn('Webhook signature verification failed: {error}', {
      error: err instanceof Error ? err.message : String(err),
    });
    throw new HTTPException(400, { message: 'Invalid webhook signature' });
  }

  // Dedup
  const webhookEvent = await stripeWebhookEventsRepository.createIfNotExists(
    event,
    { 'stripe-event-id': event.id, 'stripe-event-type': event.type },
    endpointPath
  );

  if (!webhookEvent) {
    logger.info('Skipped duplicate event: {eventId}', { eventId: event.id });
    return;
  }

  const needsProcessing = QUEUED_EVENT_PREFIXES.some((prefix) => event.type.startsWith(prefix));
  if (needsProcessing) {
    try {
      await queueManager.addWebhookJob(webhookEvent.id, event.id, event.type);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      logger.error('Failed to queue webhook job for {eventId}: {error}', { eventId: event.id, error: errorMessage });
      // Mark failed so getEventsToRetry() can re-queue via nextRetryAt. Don't rethrow — Stripe only retries on non-2xx.
      try {
        await stripeWebhookEventsRepository.markFailed(webhookEvent.id, errorMessage);
      } catch (markErr) {
        logger.error('Failed to mark webhook as failed: {eventId}', { eventId: event.id });
      }
    }
  }
};
