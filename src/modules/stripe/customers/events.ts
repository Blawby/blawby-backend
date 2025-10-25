/**
 * Stripe Customer Event Registration
 *
 * Event registration with functional handlers
 */

import { stripeCustomerService } from '@/modules/stripe/customers/services/stripe-customer.service';
import { EventType } from '@/shared/events/enums/event-types';
import { subscribeToEvent } from '@/shared/events/event-consumer';
import type { BaseEvent } from '@/shared/events/schemas/events.schema';

// Event-to-Handler mapping
export const STRIPE_CUSTOMER_EVENTS: Record<string, {
  handler: (event: BaseEvent) => Promise<void | boolean>;
  options?: Record<string, unknown>;
}> = {

  // User signup -> Create Stripe customer (immediate async execution, high priority)
  [EventType.AUTH_USER_SIGNED_UP]: {
    handler: async (event: BaseEvent) => {
      const { email, name } = event.payload as { email: string; name: string };
      await stripeCustomerService.createStripeCustomerForUser({
        userId: event.actorId!,
        email,
        name,
        source: 'platform_signup',
      });
    },
    options: {
      priority: 10, // Run early
      // No shouldQueue = immediate async execution by default
    },
  },

  // Customer created -> Log and notify (immediate async execution)
  [EventType.STRIPE_CUSTOMER_CREATED]: {
    handler: async (event: BaseEvent) => {
      console.info('Stripe customer created', {
        userId: event.actorId,
        stripeCustomerId: (event.payload as { stripe_customer_id?: string }).stripe_customer_id,
      });
    },
  },

  // Customer sync failed -> Alert (immediate async execution, critical priority)
  [EventType.STRIPE_CUSTOMER_SYNC_FAILED]: {
    handler: async (event: BaseEvent) => {
      console.error('Stripe customer sync failed', event.payload);
      // Could trigger PagerDuty/Slack alert here
      return false; // Stop propagation for critical errors
    },
    options: {
      priority: 100, // Critical - run first
      stopPropagation: true,
      // No shouldQueue = immediate async execution by default
    },
  },

} as const;

// Register all Stripe customer event handlers
export const registerStripeCustomerEvents = (): void => {
  console.info('Registering Stripe customer event handlers...');

  for (const [eventType, config] of Object.entries(STRIPE_CUSTOMER_EVENTS)) {
    subscribeToEvent(eventType, config.handler, config.options);
  }

  console.info(`Registered ${Object.keys(STRIPE_CUSTOMER_EVENTS).length} handlers`);
};
