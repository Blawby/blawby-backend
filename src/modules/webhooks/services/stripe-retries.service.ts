import { getLogger } from '@logtape/logtape';
import { queueManager } from '@/shared/queue/queue.manager';
import { stripeWebhookEventsRepository } from '@/shared/repositories/stripe.webhook-events.repository';

const logger = getLogger(['shared', 'webhook-retries']);

/**
 * Stripe Retries Service
 *
 * Handles re-queuing of failed or unprocessed Stripe webhook events.
 */

/**
 * Max concurrent webhook job enqueueing to avoid overwhelming the queue
 */
const maxConcurrentJobs = 10;

/**
 * Scan for failed events and re-queue them.
 */
const retryFailedWebhooks = async (): Promise<void> => {
  try {
    const eventsToRetry = await stripeWebhookEventsRepository.getEventsToRetry();

    if (eventsToRetry.length === 0) {
      return;
    }

    logger.info('Found {count} webhook events to retry', { count: eventsToRetry.length });

    // Process events with bounded concurrency to avoid overwhelming the queue
    const batchPromises: Promise<PromiseSettledResult<{ success: true; eventId: string }>[]>[] = [];

    for (let i = 0; i < eventsToRetry.length; i += maxConcurrentJobs) {
      const batch = eventsToRetry.slice(i, i + maxConcurrentJobs);

      const batchPromise = Promise.allSettled(
        batch.map(async (event) => {
          await queueManager.addWebhookJob(event.id, event.stripeEventId, event.eventType);

          logger.info('Re-queued webhook event {eventId} ({eventType})', {
            eventId: event.stripeEventId,
            eventType: event.eventType,
          });

          return { success: true as const, eventId: event.stripeEventId };
        })
      );

      batchPromises.push(batchPromise);
    }

    const batchResults = await Promise.all(batchPromises);
    const allRetryResults = batchResults.flat();

    const successCount = allRetryResults.filter(
      (r): r is PromiseFulfilledResult<{ success: true; eventId: string }> => r.status === 'fulfilled'
    ).length;
    const failureCount = allRetryResults.filter((r): r is PromiseRejectedResult => r.status === 'rejected').length;

    logger.info('Retry scan completed: {success} succeeded, {failed} failed', {
      success: successCount,
      failed: failureCount,
    });

    allRetryResults.forEach((result, index) => {
      if (result.status === 'rejected') {
        const event = eventsToRetry[index];
        logger.error('Failed to re-queue webhook event {eventId}: {error}', {
          eventId: event.stripeEventId,
          error: result.reason instanceof Error ? result.reason.message : String(result.reason),
        });
      }
    });
  } catch (error) {
    logger.error('Error during webhook retry scan: {error}', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

export const stripeRetriesService = {
  retryFailedWebhooks,
};
