import { getLogger } from '@logtape/logtape';
import { addWebhookJob, addOnboardingWebhookJob } from '@/shared/queue/queue.manager';
import { stripeWebhookEventsRepository } from '@/shared/repositories/stripe.webhook-events.repository';

const logger = getLogger(['shared', 'webhook-retries']);

/**
 * Stripe Retries Service
 *
 * Handles re-queuing of failed or unprocessed Stripe webhook events.
 */

/**
 * Scan for failed events and re-queue them.
 */
const ONBOARDING_EVENT_PREFIXES = ['account.', 'capability.', 'account.external_account.'] as const;

/**
 * Scan for failed events and re-queue them.
 */
async function retryFailedWebhooks(): Promise<void> {
  try {
    const eventsToRetry = await stripeWebhookEventsRepository.getEventsToRetry();

    if (eventsToRetry.length === 0) {
      return;
    }

    logger.info('Found {count} webhook events to retry', { count: eventsToRetry.length });

    for (const event of eventsToRetry) {
      try {
        // Route back to the appropriate queue
        const isOnboarding = ONBOARDING_EVENT_PREFIXES.some((prefix) => event.eventType.startsWith(prefix));

        if (isOnboarding) {
          await addOnboardingWebhookJob(event.id, event.stripeEventId, event.eventType);
        } else {
          await addWebhookJob(event.id, event.stripeEventId, event.eventType);
        }

        logger.info('Re-queued webhook event {eventId} ({eventType})', {
          eventId: event.stripeEventId,
          eventType: event.eventType,
        });
      } catch (error) {
        logger.error('Failed to re-queue webhook event {eventId}: {error}', {
          eventId: event.stripeEventId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  } catch (error) {
    logger.error('Error during webhook retry scan: {error}', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export const stripeRetriesService = {
  retryFailedWebhooks,
};
