/**
 * Analytics Event Listeners
 *
 * Handles analytics tracking for key events.
 */

import { getLogger } from '@logtape/logtape';
import {
  AuthUserSignedUp,
  PracticeCreated,
  PaymentReceived,
  OnboardingCompleted,
  StripeCustomerCreated,
} from '@/shared/events/definitions';
import { Event } from '@/shared/events/event';

const logger = getLogger(['analytics', 'listeners']);

// Mock analytics service - replace with actual analytics service
const trackEvent = async (params: {
  eventName: string;
  userId?: string;
  organizationId?: string;
  properties?: Record<string, unknown>;
}): Promise<void> => {
  logger.info('Analytics event tracked', {
    eventName: params.eventName,
    userId: params.userId,
    organizationId: params.organizationId,
    properties: params.properties,
  });
  // TODO: Implement actual analytics tracking (Mixpanel, Amplitude, etc.)
};

/**
 * Register all analytics event listeners
 */
export function registerAnalyticsListeners(): void {
  logger.info('Registering analytics event listeners...');

  Event.listen(AuthUserSignedUp, async (payload) => {
    await trackEvent({
      eventName: 'User Signed Up',
      userId: payload.user_id,
      properties: {
        email: payload.email,
        name: payload.name,
        source: 'platform_signup',
      },
    });
  });

  Event.listen(PracticeCreated, async (payload) => {
    await trackEvent({
      eventName: 'Practice Created',
      organizationId: payload.organization_id as string | undefined,
      properties: {
        organizationName: payload.name as string | undefined,
      },
    });
  });

  Event.listen(PaymentReceived, async () => {
    await trackEvent({
      eventName: 'Payment Received',
    });
  });

  Event.listen(OnboardingCompleted, async (payload) => {
    await trackEvent({
      eventName: 'Onboarding Completed',
      organizationId: payload.organization_id,
    });
  });

  Event.listen(StripeCustomerCreated, async (payload) => {
    await trackEvent({
      eventName: 'Stripe Customer Created',
      userId: payload.user_id as string | undefined,
      properties: {
        stripeCustomerId: payload.stripe_customer_id as string | undefined,
      },
    });
  });

  logger.info('Analytics event listeners registered');
}
