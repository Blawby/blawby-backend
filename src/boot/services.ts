/**
 * Services Boot
 *
 * Initialize external services and connections
 */

import { stripeRetriesService } from '@/modules/webhooks/services/stripe-retries.service';

/**
 * Initialize external services
 */
export const bootServices = (): void => {
  console.info('🚀 Booting external services...');

  // Stripe client is lazy-initialized via Proxy, no explicit initialization needed
  // Future service initializations can be added here:
  // - initializeEmailService()
  // - initializeAnalytics()

  // Only retry when workers are running — no point queuing jobs if ENABLE_QUEUE=false
  if (process.env.ENABLE_QUEUE === 'true') {
    void stripeRetriesService.retryFailedWebhooks();
  }

  console.info('✅ External services initialized successfully');
};
