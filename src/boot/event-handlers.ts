/**
 * Event Handlers Boot
 *
 * Registers all application event handlers using Laravel-style registration.
 */

import { registerStripeCustomerEvents } from '@/modules/stripe/customers/events';
import { registerEmailEvents } from '@/shared/events/handlers/email.events';

/**
 * Boot event handlers
 * Call this function to register all event handlers in the application.
 */
export const bootEventHandlers = (): void => {
  console.info('🚀 Registering event handlers...');

  // Register email events (uses Graphile Worker for queued processing)
  if (process.env.NODE_ENV === 'production') {
    registerEmailEvents();
  }

  // Feature-specific event handlers
  registerStripeCustomerEvents();

  console.info('✅ Event handlers registered successfully');
};
