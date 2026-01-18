/**
 * Payment Intent Succeeded Webhook Handler
 *
 * Handles payment_intent.succeeded webhook events from Stripe
 * Publishes PAYMENT_SUCCEEDED event for event-driven processing
 */

import { consola } from 'consola';
import type Stripe from 'stripe';

import { findPracticeClientIntakeByPaymentIntent } from '@/modules/practice-client-intakes/handlers/helpers';
import { EventType } from '@/shared/events/enums/event-types';
import { publishSimpleEvent, WEBHOOK_ACTOR_UUID } from '@/shared/events/event-publisher';
import { sanitizeError } from '@/shared/utils/logging';

export const handlePaymentIntentSucceeded = async ({
  paymentIntent,
  eventId,
}: {
  paymentIntent: Stripe.PaymentIntent;
  eventId: string;
}): Promise<void> => {
  try {
    // Check if this is a practice client intake payment
    const practiceClientIntake = await findPracticeClientIntakeByPaymentIntent(paymentIntent);

    const charge = paymentIntent.latest_charge
      ? (typeof paymentIntent.latest_charge === 'string'
        ? paymentIntent.latest_charge
        : paymentIntent.latest_charge.id)
      : undefined;

    // Publish event - event handlers will process intake updates
    void publishSimpleEvent(
      EventType.PAYMENT_SUCCEEDED,
      WEBHOOK_ACTOR_UUID,
      practiceClientIntake?.organizationId,
      {
        stripe_payment_intent_id: paymentIntent.id,
        stripe_charge_id: charge,
        amount: paymentIntent.amount,
        currency: paymentIntent.currency,
        intake_payment_id: practiceClientIntake?.id,
        succeeded_at: new Date().toISOString(),
        event_id: eventId,
      },
    );
  } catch (error) {
    consola.error('Failed to process payment_intent.succeeded webhook', {
      error: sanitizeError(error),
      eventId,
    });
    throw error;
  }
};
