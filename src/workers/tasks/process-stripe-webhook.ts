/**
 * Process Stripe Webhook Task
 *
 * Graphile Worker task for processing Stripe webhook events.
 * Handles subscription-related events and routes to appropriate handlers.
 */

import type Stripe from 'stripe';
import type { Task } from 'graphile-worker';
import { eq } from 'drizzle-orm';
import { db } from '@/shared/database';
import * as schema from '@/schema';
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

interface ProcessStripeWebhookPayload {
  webhookId: string;
  eventId: string;
  eventType: string;
}

/**
 * Process Stripe webhook event
 *
 * Task name: process-stripe-webhook
 */
export const processStripeWebhook: Task = async (
  payload: unknown,
  helpers,
): Promise<void> => {
  const { webhookId, eventId, eventType } = payload as ProcessStripeWebhookPayload;
  const startTime = Date.now();

  helpers.logger.info(
    `🚀 Starting Stripe webhook job: ${eventId} (${eventType}) - Job ID: ${webhookId}`,
  );

  try {
    // Get webhook event from database
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

    // Route to appropriate handler based on event type
    if (isSubscriptionWebhookEvent(event.type)) {
      // Handle subscription-related events (product.*, price.*)
      await processSubscriptionWebhookEvent(event);
      // Mark as processed (subscription service doesn't do this)
      await markWebhookProcessed(webhookId);
    } else if (event.type.startsWith('customer.subscription.')) {
      // Better Auth handles customer.subscription.* events automatically via callbacks
      // (onSubscriptionComplete, onSubscriptionUpdate, onSubscriptionCancel)
      // We just need to mark as processed since Better Auth already handled it
      helpers.logger.info(
        `Subscription lifecycle event handled by Better Auth: ${event.type}`,
      );
      await markWebhookProcessed(webhookId);
    } else if (
      event.type.startsWith('account.') ||
      event.type.startsWith('capability.') ||
      event.type.startsWith('account.external_account.')
    ) {
      // Handle onboarding-related events (marks as processed internally)
      await processOnboardingEvent(eventId);
    } else {
      // Handle other Stripe webhook types (payments, etc.)
      helpers.logger.info(`Unhandled webhook event type: ${event.type}`);
      // Mark as processed even if unhandled (to avoid retries)
      await markWebhookProcessed(webhookId);
      // TODO: Add payment webhook processing when ready
    }

    const duration = Date.now() - startTime;
    helpers.logger.info(
      `✅ Stripe webhook job completed successfully: ${eventId} - Duration: ${duration}ms`,
    );

    // Log database status
    try {
      const updatedWebhookEvent = await findWebhookById(webhookId);

      if (updatedWebhookEvent) {
        helpers.logger.info(`📊 Database status for ${eventId}:`, {
          processed: updatedWebhookEvent.processed,
          processedAt: updatedWebhookEvent.processedAt?.toISOString(),
          retryCount: updatedWebhookEvent.retryCount,
          error: updatedWebhookEvent.error || 'None',
        } as Record<string, unknown>);
      } else {
        helpers.logger.warn(`⚠️  Webhook event not found in database: ${webhookId}`);
      }
    } catch (dbError) {
      const dbErrorMsg = dbError instanceof Error ? dbError.message : String(dbError);
      helpers.logger.error(
        `❌ Failed to check database status for ${eventId}: ${dbErrorMsg}`,
      );
    }
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage
      = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : undefined;

    // Mark as failed (increments retry count, sets next retry time)
    try {
      const webhookEvent = await findWebhookById(webhookId);
      if (webhookEvent) {
        await markWebhookFailed(webhookId, errorMessage, errorStack);
      }
    } catch (markError) {
      const markErrorMsg = markError instanceof Error ? markError.message : String(markError);
      helpers.logger.error(`Failed to mark webhook as failed: ${webhookId} - ${markErrorMsg}`);
    }

    const errorMsg = error instanceof Error ? error.message : String(error);
    helpers.logger.error(
      `❌ Stripe webhook job failed: ${eventId} - Duration: ${duration}ms - ${errorMsg}`,
    );
    throw error;
  }
};

