/**
 * Process Stripe Webhook Task
 *
 * Graphile Worker task for processing Stripe webhook events.
 */

import { getLogger } from '@logtape/logtape';
import type Stripe from 'stripe';
import type { Task } from 'graphile-worker';
import {
  findWebhookById,
  markWebhookProcessed,
  markWebhookFailed,
} from '@/shared/repositories/stripe.webhook-events.repository';
import {
  processSubscriptionWebhookEvent,
  isSubscriptionWebhookEvent,
} from '@/modules/subscriptions/services/subscriptionWebhooks.service';
import { processEvent as processOnboardingEvent } from '@/modules/webhooks/services/onboarding-webhooks.service';
import { processEvent as processPracticeClientIntakeEvent } from '@/modules/webhooks/services/practice-client-intakes-webhooks.service';
import {
  isPaymentIntentEvent,
  isSubscriptionEvent,
} from '@/shared/utils/stripeGuards';

const logger = getLogger(['app', 'worker', 'stripe-webhook']);

interface ProcessStripeWebhookPayload {
  webhookId: string;
  eventId: string;
  eventType: string;
}

// --- HELPERS ---

/**
 * Checks if the event belongs to the onboarding flow
 */
const isOnboardingEvent = (eventType: string): boolean => {
  return (
    eventType.startsWith('account.') ||
    eventType.startsWith('capability.') ||
    eventType.startsWith('account.external_account.')
  );
}

// --- MAIN TASK ---

export const processStripeWebhook: Task = async (payload, helpers) => {
  const { webhookId, eventId, eventType } = payload as ProcessStripeWebhookPayload;
  const startTime = Date.now();

  logger.info("🚀 Starting Stripe webhook job: {eventId} ({eventType}) - Job ID: {webhookId}", {
    eventId,
    eventType,
    webhookId
  });

  try {
    // 1. Fetch & Validate
    const webhookEvent = await findWebhookById(webhookId);

    if (!webhookEvent) {
      logger.error("Webhook event not found: {webhookId}", { webhookId });
      return;
    }

    if (webhookEvent.processed) {
      logger.info("Webhook event already processed: {eventId}", { eventId });
      return;
    }

    const event = webhookEvent.payload as Stripe.Event;

    // 2. Route & Process
    if (isSubscriptionWebhookEvent(event.type)) {
      const result = await processSubscriptionWebhookEvent(event);
      if (!result.success) {
        throw new Error(result.error.message);
      }
      await markWebhookProcessed(webhookId);

    } else if (isSubscriptionEvent(event)) {
      logger.info("Subscription lifecycle event handled by Better Auth: {eventType}", { eventType: event.type });
      await markWebhookProcessed(webhookId);

    } else if (isOnboardingEvent(event.type)) {
      const result = await processOnboardingEvent(eventId);
      if (!result.success) {
        throw new Error(result.error.message);
      }
      // Service marks as processed internally

    } else if (isPaymentIntentEvent(event) || event.type === 'charge.succeeded') {
      const result = await processPracticeClientIntakeEvent(eventId);
      if (!result.success) {
        throw new Error(result.error.message);
      }
      // Service marks as processed internally

    } else {
      // Fallback
      logger.info("Unhandled webhook event type: {eventType}", { eventType: event.type });
      await markWebhookProcessed(webhookId);
    }

    // 3. Success Logging
    const duration = Date.now() - startTime;
    logger.info("✅ Job completed: {eventId} - {duration}ms", { eventId, duration });

    // 4. Debug Status (Fail-safe)
    try {
      const updated = await findWebhookById(webhookId);
      if (updated) {
        logger.info("📊 Database status for {eventId}:", {
          eventId,
          processed: updated.processed,
          retryCount: updated.retryCount,
          error: updated.error || 'None',
        });
      }
    } catch (dbLogErr) {
      logger.warn("Failed to log final DB status: {error}", { error: dbLogErr });
    }

  } catch (error) {
    // 5. Error Handling
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : undefined;

    try {
      // Only mark failed if we actually found the webhook originally
      await markWebhookFailed(webhookId, errorMessage, errorStack);
    } catch (markError) {
      logger.error("CRITICAL: Failed to mark webhook as failed in DB: {webhookId}", { webhookId });
    }

    logger.error("❌ Job failed: {eventId} - {duration}ms - {error}", {
      eventId,
      duration,
      error: errorMessage,
      stack: errorStack,
    });
    throw error;
  }
};
