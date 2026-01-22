/**
 * Services Boot
 *
 * Initialize external services and connections
 */

import { onboardingWebhooksService } from '@/modules/webhooks/services/onboarding-webhooks.service';

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
  // This recovers events lost during server restarts (common in dev)
  void onboardingWebhooksService.retryFailedWebhooks();

  console.info('✅ External services initialized successfully');
};
