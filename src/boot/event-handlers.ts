/**
 * Event Handlers Boot
 *
 * Registers all application event handlers using Laravel-style registration.
 */

import { isProductionLike } from '@/shared/utils/env';
import { registerUserEvents } from '@/shared/auth/events/user.events';
import { registerStripeCustomerEvents } from '@/modules/stripe/customers/events';
import { registerPreferencesEvents } from '@/modules/preferences/events';
import { registerOnboardingEvents } from '@/modules/onboarding/events/onboarding.events';
import { registerEmailEvents } from '@/shared/events/handlers/email.events';
import { registerPracticeEvents } from '@/modules/practice/events/practice.events';
import { registerPracticeClientIntakeEvents } from '@/modules/practice-client-intakes/events/practice-client-intakes.events';

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

  // Core event handlers (always enabled)
  registerUserEvents();
  registerStripeCustomerEvents();
  registerPreferencesEvents();
  registerOnboardingEvents();
  registerPracticeEvents();
  registerPracticeClientIntakeEvents();

  console.info('✅ Event handlers registered successfully');
};
