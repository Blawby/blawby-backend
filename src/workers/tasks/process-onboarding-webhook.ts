/**
 * Process Onboarding Webhook Task
 *
 * Graphile Worker task for processing Stripe Connect onboarding webhook events.
 */

import type { Task } from 'graphile-worker';
import { existsByStripeEventId } from '@/shared/repositories/stripe.webhook-events.repository';
import { processEvent as processOnboardingEvent } from '@/modules/webhooks/services/onboarding-webhooks.service';

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
          processedAt: webhookEvent.processedAt?.toISOString(),
          retryCount: webhookEvent.retryCount,
          error: webhookEvent.error || 'None',
        } as Record<string, unknown>);
      } else {
        helpers.logger.warn(`⚠️  Webhook event not found in database: ${eventId}`);
      }
    } catch (dbError) {
      const dbErrorMsg = dbError instanceof Error ? dbError.message : String(dbError);
      helpers.logger.error(
        `❌ Failed to check database status for ${eventId}: ${dbErrorMsg}`,
      );
    }
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMsg = error instanceof Error ? error.message : String(error);
    helpers.logger.error(
      `❌ Onboarding webhook job failed: ${eventId} - Duration: ${duration}ms - ${errorMsg}`,
    );
    throw error;
  }
};

