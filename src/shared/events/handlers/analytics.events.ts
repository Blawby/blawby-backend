/**
 * Analytics Event Registration
 *
 * Laravel-style event registration for analytics tracking
 * Centralized analytics event-to-handler mapping
 */

import { EventType } from '@/shared/events/enums/event-types';
import { subscribeToEvent } from '@/shared/events/event-consumer';
import type { BaseEvent } from '@/shared/events/schemas/events.schema';
import { QUEUE_NAMES } from '@/shared/queue/queue.config';

// Mock analytics service - replace with actual analytics service
const trackEvent = async (params: {
  eventName: string;
  userId?: string;
  organizationId?: string;
  properties?: Record<string, unknown>;
}): Promise<void> => {
  console.log(`📊 Analytics event tracked: ${params.eventName}`, {
    userId: params.userId,
    organizationId: params.organizationId,
    properties: params.properties,
  });
  // TODO: Implement actual analytics tracking (Mixpanel, Amplitude, etc.)
};

// Event-to-Handler mapping (like Laravel's $listen)
export const ANALYTICS_EVENTS = {

  // User signup tracking (queued - external analytics service)
  [EventType.AUTH_USER_SIGNED_UP]: {
    handler: async (event: BaseEvent) => {
      await trackEvent({
        eventName: 'User Signed Up',
        userId: event.actorId,
        properties: {
          email: (event.payload as { email: string }).email,
          name: (event.payload as { name: string }).name,
          source: 'platform_signup',
        },
      });
    },
    options: {
      priority: 0,
      shouldQueue: true, // Queue - external analytics service
      queue: 'analytics',
    },
  },

  // User login tracking
  [EventType.AUTH_USER_LOGGED_IN]: {
    handler: async (event: BaseEvent) => {
      await trackEvent({
        eventName: 'User Logged In',
        userId: event.actorId,
        properties: {
          loginMethod: 'email', // Could be enhanced to detect OAuth, etc.
        },
      });
    },
    options: {
      priority: 0,
      shouldQueue: true,
      queue: QUEUE_NAMES.ANALYTICS,
    },
  },

  // Practice creation tracking
  [EventType.PRACTICE_CREATED]: {
    handler: async (event: BaseEvent) => {
      await trackEvent({
        eventName: 'Practice Created',
        userId: event.actorId,
        organizationId: event.organizationId,
        properties: {
          organizationName: (event.payload as { organizationName: string }).organizationName,
        },
      });
    },
    options: {
      priority: 0,
      shouldQueue: true,
      queue: QUEUE_NAMES.ANALYTICS,
    },
  },

  // Payment received tracking
  [EventType.PAYMENT_RECEIVED]: {
    handler: async (event: BaseEvent) => {
      await trackEvent({
        eventName: 'Payment Received',
        userId: event.actorId,
        organizationId: event.organizationId,
        properties: {
          amount: (event.payload as { amount: number }).amount,
          currency: (event.payload as { currency: string }).currency,
          paymentMethod: (event.payload as { paymentMethod?: string }).paymentMethod,
        },
      });
    },
    options: {
      priority: 0,
      shouldQueue: true,
      queue: QUEUE_NAMES.ANALYTICS,
    },
  },

  // Onboarding completed tracking
  [EventType.ONBOARDING_COMPLETED]: {
    handler: async (event: BaseEvent) => {
      await trackEvent({
        eventName: 'Onboarding Completed',
        userId: event.actorId,
        organizationId: event.organizationId,
        properties: {
          organizationName: (event.payload as { organizationName: string }).organizationName,
          completionTime: (event.payload as { completionTime?: number }).completionTime,
        },
      });
    },
    options: {
      priority: 0,
      shouldQueue: true,
      queue: QUEUE_NAMES.ANALYTICS,
    },
  },

  // Stripe customer created tracking
  [EventType.STRIPE_CUSTOMER_CREATED]: {
    handler: async (event: BaseEvent) => {
      await trackEvent({
        eventName: 'Stripe Customer Created',
        userId: event.actorId,
        properties: {
          stripeCustomerId: (event.payload as { stripe_customer_id: string }).stripe_customer_id,
          source: (event.payload as { source: string }).source,
        },
      });
    },
    options: {
      priority: 0,
      shouldQueue: true,
      queue: QUEUE_NAMES.ANALYTICS,
    },
  },

} as const;

// Register all analytics event handlers
export const registerAnalyticsEvents = (): void => {
  console.info('Registering analytics event handlers...');

  for (const [eventType, config] of Object.entries(ANALYTICS_EVENTS)) {
    subscribeToEvent(eventType, config.handler, config.options);
  }

  console.info(`Registered ${Object.keys(ANALYTICS_EVENTS).length} analytics handlers`);
};
