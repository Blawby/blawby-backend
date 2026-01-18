/**
 * Process Stripe Webhook Task
 *
 * Graphile Worker task for processing Stripe webhook events.
 */

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

  helpers.logger.info(
    `🚀 Starting Stripe webhook job: ${eventId} (${eventType}) - Job ID: ${webhookId}`,
  );

  try {
    // 1. Fetch & Validate
    const webhookEvent = await findWebhookById(webhookId);

    if (!webhookEvent) {
      helpers.logger.error(`Webhook event not found: ${webhookId}`);
      return;
    }

    if (webhookEvent.processed) {
      helpers.logger.info(`Webhook event already processed: ${eventId}`);
      return;
    }

    const event = webhookEvent.payload as Stripe.Event;

    // 2. Route & Process
    if (isSubscriptionWebhookEvent(event.type)) {
      await processSubscriptionWebhookEvent(event);
      await markWebhookProcessed(webhookId);

    } else if (isSubscriptionEvent(event)) {
      helpers.logger.info(`Subscription lifecycle event handled by Better Auth: ${event.type}`);
      await markWebhookProcessed(webhookId);

    } else if (isOnboardingEvent(event.type)) {
      await processOnboardingEvent(eventId);
      // Service marks as processed internally

    } else if (isPaymentIntentEvent(event) || event.type === 'charge.succeeded') {
      // Process practice client intake webhook events
      // Also handle charge.succeeded as Payment Links create charges
      await processPracticeClientIntakeEvent(eventId);
      // Service marks as processed internally

    } else {
      // Fallback
      helpers.logger.info(`Unhandled webhook event type: ${event.type}`);
      await markWebhookProcessed(webhookId);
    }

    // 3. Success Logging
    const duration = Date.now() - startTime;
    helpers.logger.info(`✅ Job completed: ${eventId} - ${duration}ms`);

    // 4. Debug Status (Fail-safe)
    // We fetch the updated status for debugging, but we don't await/block purely for logging
    // or we catch it so it doesn't fail the whole job.
    try {
      const updated = await findWebhookById(webhookId);
      if (updated) {
        helpers.logger.info(`📊 Database status for ${eventId}:`, {
          processed: updated.processed,
          retryCount: updated.retryCount,
          error: updated.error || 'None',
        });
      }
    } catch (dbLogErr) {
      helpers.logger.warn(`Failed to log final DB status: ${dbLogErr}`);
    }

  } catch (error) {
    // 5. Error Handling
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : undefined;

    try {
      // Only mark failed if we actually found the webhook originally
      // (Optimization: avoid DB call if we know ID is invalid, but safe to just call markWebhookFailed)
      await markWebhookFailed(webhookId, errorMessage, errorStack);
    } catch (markError) {
      helpers.logger.error(`CRITICAL: Failed to mark webhook as failed in DB: ${webhookId}`);
    }

    helpers.logger.error(
      `❌ Job failed: ${eventId} - ${duration}ms - ${errorMessage}`,
    );
    throw error;
  }
};
