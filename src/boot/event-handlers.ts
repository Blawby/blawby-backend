/**
 * Event Handlers Boot
 *
 * Registers all application event handlers using Laravel-style registration.
 */

import { isProductionLike } from '@/shared/utils/env';
import { registerStripeCustomerEvents } from '@/modules/stripe/customers/events';
import { registerPreferencesEvents } from '@/modules/preferences/events';
import { registerEmailEvents } from '@/shared/events/handlers/email.events';

/**
 * Boot event handlers
 * Call this function to register all event handlers in the application.
 */
export const bootEventHandlers = (): void => {
  console.info('🚀 Registering event handlers...');

  // Register email events (uses Graphile Worker for queued processing)
  // Enable in staging and production, disable in development
  if (isProductionLike()) {
    registerEmailEvents();
  }

  // Feature-specific event handlers
  registerStripeCustomerEvents();
  registerPreferencesEvents();

  console.info('✅ Event handlers registered successfully');
};
