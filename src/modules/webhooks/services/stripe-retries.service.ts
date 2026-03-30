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
 * Event types that should be routed to the onboarding queue
 */
const ONBOARDING_EVENT_PREFIXES = ['account.', 'capability.', 'account.external_account.'] as const;

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

    // Build all batch promises first (no await in loop)
    const batchPromises: Promise<PromiseSettledResult<{ success: true; eventId: string }>[]>[] = [];

    for (let i = 0; i < eventsToRetry.length; i += maxConcurrentJobs) {
      const batch = eventsToRetry.slice(i, i + maxConcurrentJobs);

      const batchPromise = Promise.allSettled(
        batch.map((event) => {
          const isOnboarding = ONBOARDING_EVENT_PREFIXES.some((prefix) => event.eventType.startsWith(prefix));

          const jobPromise = isOnboarding
            ? queueManager.addOnboardingWebhookJob(event.id, event.stripeEventId, event.eventType)
            : queueManager.addWebhookJob(event.id, event.stripeEventId, event.eventType);

          return jobPromise.then(() => {
            logger.info('Re-queued webhook event {eventId} ({eventType})', {
              eventId: event.stripeEventId,
              eventType: event.eventType,
            });

            return { success: true as const, eventId: event.stripeEventId };
          });
        })
      );

      batchPromises.push(batchPromise);
    }

    // Now await all batches outside the loop
    const allBatchResults = await Promise.all(batchPromises);

    // Track results
    let successCount = 0;
    let failureCount = 0;

    allBatchResults.forEach((batchResults, batchIndex) => {
      const batch = eventsToRetry.slice(batchIndex * maxConcurrentJobs, (batchIndex + 1) * maxConcurrentJobs);

      batchResults.forEach((result, resultIndex) => {
        if (result.status === 'fulfilled') {
          successCount++;
        } else {
          failureCount++;
          const event = batch[resultIndex];
          logger.error('Failed to re-queue webhook event {eventId}: {error}', {
            eventId: event.stripeEventId,
            error: result.reason instanceof Error ? result.reason.message : String(result.reason),
          });
        }
      });
    });

    logger.info('Retry scan completed: {success} succeeded, {failed} failed', {
      success: successCount,
      failed: failureCount,
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
