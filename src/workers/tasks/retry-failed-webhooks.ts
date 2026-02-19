/**
 * Retry Failed Webhooks Task
 *
 * Graphile Worker task for retrying failed or unprocessed Stripe webhook events.
 */

import { getLogger } from '@logtape/logtape';
import type { Task } from 'graphile-worker';
import { stripeRetriesService } from '@/modules/webhooks/services/stripe-retries.service';

const logger = getLogger(['app', 'worker', 'retry-failed-webhooks']);

export const retryFailedWebhooks: Task = async () => {
  logger.info('🚀 Starting periodic webhook retry scan');
  const startTime = Date.now();

  try {
    await stripeRetriesService.retryFailedWebhooks();
    const duration = Date.now() - startTime;
    logger.info('✅ Webhook retry scan completed - {duration}ms', { duration });
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error('❌ Webhook retry scan failed - {duration}ms - {error}', {
      duration,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
};
