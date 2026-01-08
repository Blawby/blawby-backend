/**
 * Process Onboarding Webhook Task
 *
 * Graphile Worker task for processing Stripe Connect onboarding webhook events.
 */

import type { Task } from 'graphile-worker';
import { existsByStripeEventId } from '@/shared/repositories/stripe.webhook-events.repository';
import { processEvent as processOnboardingEvent } from '@/modules/onboarding/services/onboarding-webhooks.service';

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
  payload: ProcessOnboardingWebhookPayload,
  helpers,
): Promise<void> => {
  const { webhookId, eventId, eventType } = payload;
  const startTime = Date.now();

  helpers.logger.info(
    `🚀 Starting onboarding webhook job: ${eventId} (${eventType}) - Job ID: ${webhookId}`,
  );

  try {
    await processOnboardingEvent(eventId);

    const duration = Date.now() - startTime;
    helpers.logger.info(
      `✅ Onboarding webhook job completed successfully: ${eventId} - Duration: ${duration}ms`,
    );

    // Log database status
    try {
      const webhookEvent = await existsByStripeEventId(eventId);

      if (webhookEvent) {
        helpers.logger.info(`📊 Database status for ${eventId}:`, {
          processed: webhookEvent.processed,
          processedAt: webhookEvent.processedAt,
          retryCount: webhookEvent.retryCount,
          error: webhookEvent.error || 'None',
        });
      } else {
        helpers.logger.warn(`⚠️  Webhook event not found in database: ${eventId}`);
      }
    } catch (dbError) {
      helpers.logger.error(
        `❌ Failed to check database status for ${eventId}:`,
        dbError,
      );
    }
  } catch (error) {
    const duration = Date.now() - startTime;
    helpers.logger.error(
      `❌ Onboarding webhook job failed: ${eventId} - Duration: ${duration}ms`,
      error,
    );
    throw error;
  }
};

