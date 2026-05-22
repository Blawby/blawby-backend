/**
 * Services Boot
 *
 * Initialize external services and connections
 */

import { getLogger } from '@logtape/logtape';
import { stripeRetriesService } from '@/modules/webhooks/services/stripe-retries.service';

const logger = getLogger(['app', 'boot', 'services']);

/**
 * Initialize external services
 */
export const bootServices = (): void => {
  logger.info('Booting external services...');

  // Stripe client is lazy-initialized via Proxy, no explicit initialization needed
  // Future service initializations can be added here:
  // - initializeEmailService()
  // - initializeAnalytics()

  // Only retry when workers are running — no point queuing jobs if ENABLE_QUEUE=false
  if (process.env.ENABLE_QUEUE === 'true') {
    stripeRetriesService.retryFailedWebhooks().catch((err: unknown) => {
      logger.error('retryFailedWebhooks failed: {err}', { err });
    });
  }

  logger.info('External services initialized successfully');
};
