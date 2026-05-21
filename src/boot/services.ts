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

  // Retry any failed/stuck webhooks on boot
  // This recovers events lost during server restarts (common in dev/staging)
  void stripeRetriesService.retryFailedWebhooks();

  console.info('✅ External services initialized successfully');
};
