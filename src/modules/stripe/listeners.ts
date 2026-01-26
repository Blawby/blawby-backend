/**
 * Stripe Module Event Listeners
 *
 * Handles Stripe-related events including customer creation and sync.
 */

import { getLogger } from '@logtape/logtape';
import { stripeCustomerService } from '@/modules/stripe/customers/services/stripe-customer.service';
import {
  AuthUserSignedUp,
  StripeCustomerCreated,
  StripeCustomerSyncFailed,
} from '@/shared/events/definitions';
import { Event } from '@/shared/events/event';

const logger = getLogger(['stripe', 'listeners']);

/**
 * Register all Stripe event listeners
 */
export function registerStripeListeners(): void {
  logger.info('Registering Stripe event listeners...');

  // User signup -> Create Stripe customer
  Event.listen(AuthUserSignedUp, async (payload) => {
    await stripeCustomerService.createStripeCustomerForUser({
      userId: payload.user_id,
      email: payload.email,
      name: payload.name ?? 'User',
      source: 'platform_signup',
    });
  });

  // Customer created - log for debugging
  Event.listen(StripeCustomerCreated, async (payload) => {
    logger.info('Stripe customer created', {
      userId: payload.user_id,
      stripeCustomerId: payload.stripe_customer_id,
    });
  });

  // Customer sync failed - alert
  Event.listen(StripeCustomerSyncFailed, async (payload) => {
    logger.error('Stripe customer sync failed', {
      userId: payload.user_id,
      error: payload.error,
    });
    // Could trigger PagerDuty/Slack alert here
    return false; // Stop propagation for critical errors
  });

  logger.info('Stripe event listeners registered');
}
