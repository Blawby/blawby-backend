/**
 * Process Onboarding Webhook Task
 *
 * Graphile Worker task for processing Stripe Connect onboarding webhook events.
 */

import { getLogger } from '@logtape/logtape';
import type { Task } from 'graphile-worker';
import { stripeWebhookEventsRepository } from '@/shared/repositories/stripe.webhook-events.repository';
import { onboardingWebhooksService } from '@/modules/webhooks/services/onboarding-webhooks.service';

const logger = getLogger(['app', 'worker', 'onboarding-webhook']);

interface ProcessOnboardingWebhookPayload {
  webhookId: string;
  eventId: string;
  eventType: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const isProcessOnboardingWebhookPayload = (payload: unknown): payload is ProcessOnboardingWebhookPayload =>
  isRecord(payload) &&
  typeof payload.webhookId === 'string' &&
  typeof payload.eventId === 'string' &&
  typeof payload.eventType === 'string';

/**
 * Process onboarding webhook event
 *
 * Task name: process-onboarding-webhook
 */
export const processOnboardingWebhook: Task = async (payload: unknown, _helpers): Promise<void> => {
  if (!isProcessOnboardingWebhookPayload(payload)) {
    throw new Error('Invalid processOnboardingWebhook payload: missing required fields or incorrect types');
  }

  const { webhookId, eventId, eventType } = payload;
  const startTime = Date.now();

  logger.info('🚀 Starting onboarding webhook job: {eventId} ({eventType}) - Job ID: {webhookId}', {
    eventId,
    eventType,
    webhookId,
  });

  try {
    await onboardingWebhooksService.processEvent(eventId);

    const duration = Date.now() - startTime;
    logger.info('✅ Onboarding webhook job completed successfully: {eventId} - Duration: {duration}ms', {
      eventId,
      duration,
    });

    // Log database status
    try {
      const webhookEvent = await stripeWebhookEventsRepository.existsByStripeEventId(eventId);

      if (webhookEvent) {
        logger.info('📊 Database status for {eventId}:', {
          eventId,
          processed: webhookEvent.processed,
          processedAt: webhookEvent.processedAt?.toISOString(),
          retryCount: webhookEvent.retryCount,
          error: webhookEvent.error ?? 'None',
        });
      } else {
        logger.warn('⚠️  Webhook event not found in database: {eventId}', { eventId });
      }
    } catch (dbError) {
      logger.error('❌ Failed to check database status for {eventId}: {error}', {
        eventId,
        error: dbError instanceof Error ? dbError.message : String(dbError),
      });
    }
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error('❌ Onboarding webhook job failed: {eventId} - Duration: {duration}ms - {error}', {
      eventId,
      duration,
      error: errorMsg,
    });
    throw error;
  }
};
