/**
 * Process Onboarding Webhook Task
 *
 * Graphile Worker task for processing Stripe Connect onboarding webhook events.
 */

import { getLogger } from '@logtape/logtape';
import type { Task } from 'graphile-worker';
import { existsByStripeEventId } from '@/shared/repositories/stripe.webhook-events.repository';
import { processEvent as processOnboardingEvent } from '@/modules/webhooks/services/onboarding-webhooks.service';

const logger = getLogger(['app', 'worker', 'onboarding-webhook']);

interface ProcessOnboardingWebhookPayload {
  webhookId: string;
  eventId: string;
  eventType: string;
}

/**
 * Process onboarding webhook event
 *
 * Task name: process-onboarding-webhook
 */
export const processOnboardingWebhook: Task = async (
  payload: unknown,
  helpers,
): Promise<void> => {
  const { webhookId, eventId, eventType } = payload as ProcessOnboardingWebhookPayload;
  const startTime = Date.now();

  logger.info("🚀 Starting onboarding webhook job: {eventId} ({eventType}) - Job ID: {webhookId}", {
    eventId,
    eventType,
    webhookId
  });

  try {
    const result = await processOnboardingEvent(eventId);

    if (!result.success) {
      throw new Error(result.error.message);
    }

    const duration = Date.now() - startTime;
    logger.info("✅ Onboarding webhook job completed successfully: {eventId} - Duration: {duration}ms", {
      eventId,
      duration
    });

    // Log database status
    try {
      const webhookEvent = await existsByStripeEventId(eventId);

      if (webhookEvent) {
        logger.info("📊 Database status for {eventId}:", {
          eventId,
          processed: webhookEvent.processed,
          processedAt: webhookEvent.processedAt?.toISOString(),
          retryCount: webhookEvent.retryCount,
          error: webhookEvent.error || 'None',
        });
      } else {
        logger.warn("⚠️  Webhook event not found in database: {eventId}", { eventId });
      }
    } catch (dbError) {
      logger.error("❌ Failed to check database status for {eventId}: {error}", {
        eventId,
        error: dbError instanceof Error ? dbError.message : String(dbError)
      });
    }
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error("❌ Onboarding webhook job failed: {eventId} - Duration: {duration}ms - {error}", {
      eventId,
      duration,
      error: errorMsg
    });
    throw error;
  }
};
