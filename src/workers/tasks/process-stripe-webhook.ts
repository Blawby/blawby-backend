/**
 * Process Stripe Webhook Task
 *
 * Graphile Worker task for processing Stripe webhook events.
 */

import { getLogger } from '@logtape/logtape';
import type { Task } from 'graphile-worker';
import { invoiceWebhooksService } from '@/modules/invoices/services/invoice-webhooks.service';
import { subscriptionWebhooksService } from '@/modules/subscriptions/services/subscriptionWebhooks.service';
import { onboardingWebhooksService } from '@/modules/webhooks/services/onboarding-webhooks.service';
import { practiceClientIntakesWebhooksService } from '@/modules/webhooks/services/practice-client-intakes-webhooks.service';
import { stripeWebhookEventsRepository } from '@/shared/repositories/stripe.webhook-events.repository';
import { isPaymentIntentEvent, isStripeEvent, isSubscriptionEvent } from '@/shared/utils/stripeGuards';

const logger = getLogger(['app', 'worker', 'stripe-webhook']);

interface ProcessStripeWebhookPayload {
  webhookId: string;
  eventId: string;
  eventType: string;
}

const isProcessStripeWebhookPayload = (payload: unknown): payload is ProcessStripeWebhookPayload => {
  if (!payload || typeof payload !== 'object') {
    return false;
  }

  const candidate = payload as Record<string, unknown>;
  return (
    typeof candidate.webhookId === 'string' &&
    typeof candidate.eventId === 'string' &&
    typeof candidate.eventType === 'string'
  );
};

// --- HELPERS ---

/**
 * Checks if the event belongs to the onboarding flow
 */
const isOnboardingEvent = (eventType: string): boolean =>
  eventType.startsWith('account.') ||
  eventType.startsWith('capability.') ||
  eventType.startsWith('account.external_account.');

/**
 * Checks if the event belongs to the invoice flow
 */
const isInvoiceEvent = (eventType: string): boolean => eventType.startsWith('invoice.');

// --- MAIN TASK ---

export const processStripeWebhook: Task = async (payload, _helpers) => {
  if (!isProcessStripeWebhookPayload(payload)) {
    throw new Error('Invalid processStripeWebhook payload: missing required fields or incorrect types');
  }

  const { webhookId, eventId, eventType } = payload;
  const startTime = Date.now();

  logger.info('🚀 Starting Stripe webhook job: {eventId} ({eventType}) - Job ID: {webhookId}', {
    eventId,
    eventType,
    webhookId,
  });

  try {
    // 1. Fetch & Validate
    const webhookEvent = await stripeWebhookEventsRepository.findById(webhookId);

    if (!webhookEvent) {
      throw new Error(`Webhook event not found in database: ${webhookId}`);
    }

    if (webhookEvent.processed) {
      logger.info('Webhook event already processed: {eventId}', { eventId });
      return;
    }

    const event = webhookEvent.payload;

    if (!isStripeEvent(event)) {
      throw new Error(`Stored webhook payload is not a valid Stripe event: ${webhookId}`);
    }

    // 2. Route & Process
    if (subscriptionWebhooksService.isSubscriptionWebhookEvent(event.type)) {
      await subscriptionWebhooksService.processSubscriptionWebhookEvent(event);
      await stripeWebhookEventsRepository.markProcessed(webhookId);
    } else if (isSubscriptionEvent(event)) {
      logger.info('Subscription lifecycle event handled by Better Auth: {eventType}', { eventType: event.type });
      await stripeWebhookEventsRepository.markProcessed(webhookId);
    } else if (isOnboardingEvent(event.type)) {
      await onboardingWebhooksService.processEvent(eventId);
      // Service marks as processed internally
    } else if (isInvoiceEvent(event.type)) {
      await invoiceWebhooksService.processEvent(event);
      await stripeWebhookEventsRepository.markProcessed(webhookId);
    } else if (
      isPaymentIntentEvent(event) ||
      event.type === 'charge.succeeded' ||
      event.type === 'checkout.session.completed'
    ) {
      await practiceClientIntakesWebhooksService.processEvent(eventId);
      // Service marks as processed internally
    } else {
      // Fallback
      logger.info('Unhandled webhook event type: {eventType}', { eventType: event.type });
      await stripeWebhookEventsRepository.markProcessed(webhookId);
    }

    // 3. Success Logging
    const duration = Date.now() - startTime;
    logger.info('✅ Job completed: {eventId} - {duration}ms', { eventId, duration });

    // 4. Debug Status (Fail-safe)
    try {
      const updated = await stripeWebhookEventsRepository.findById(webhookId);
      if (updated) {
        logger.info('📊 Database status for {eventId}:', {
          eventId,
          processed: updated.processed,
          retryCount: updated.retryCount,
          error: updated.error ?? 'None',
        });
      }
    } catch (dbLogErr) {
      logger.warn('Failed to log final DB status: {error}', { error: dbLogErr });
    }
  } catch (error) {
    // 5. Error Handling
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : undefined;

    try {
      // Only mark failed if we actually found the webhook originally
      await stripeWebhookEventsRepository.markFailed(webhookId, errorMessage, errorStack);
    } catch (_markError) {
      logger.error('CRITICAL: Failed to mark webhook as failed in DB: {webhookId}', { webhookId });
    }

    logger.error('❌ Job failed: {eventId} - {duration}ms - {error}', {
      eventId,
      duration,
      error: errorMessage,
      stack: errorStack,
    });
    throw error;
  }
};
