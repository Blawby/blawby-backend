/**
 * Payment Intent Canceled Webhook Handler
 *
 * Handles payment_intent.canceled webhook events from Stripe
 * Publishes PAYMENT_CANCELED event for event-driven processing
 */

import { consola } from 'consola';
import type Stripe from 'stripe';

import { findPracticeClientIntakeByPaymentIntent } from '@/modules/practice-client-intakes/handlers/helpers';
import { EventType } from '@/shared/events/enums/event-types';
import { publishSimpleEvent } from '@/shared/events/event-publisher';
import { sanitizeError } from '@/shared/utils/logging';

export const handlePaymentIntentCanceled = async ({
  paymentIntent,
  eventId,
}: {
  paymentIntent: Stripe.PaymentIntent;
  eventId: string;
}): Promise<void> => {
  try {
    // Check if this is a practice client intake payment
    const practiceClientIntake = await findPracticeClientIntakeByPaymentIntent(paymentIntent);

    // Publish event - event handlers will process intake updates
    void publishSimpleEvent(
      EventType.PAYMENT_CANCELED,
      'organization',
      practiceClientIntake?.organizationId,
      {
        stripe_payment_intent_id: paymentIntent.id,
        amount: practiceClientIntake?.amount || paymentIntent.amount,
        currency: practiceClientIntake?.currency || paymentIntent.currency,
        intake_payment_id: practiceClientIntake?.id,
        cancellation_reason: paymentIntent.cancellation_reason,
        canceled_at: new Date().toISOString(),
        event_id: eventId,
      },
    );

    if (!practiceClientIntake) {
      consola.warn('Payment intent not found in practice client intakes', {
        stripePaymentIntentId: paymentIntent.id,
        hasPaymentLink: 'payment_link' in paymentIntent && !!paymentIntent.payment_link,
        cancellationReason: paymentIntent.cancellation_reason,
      });
    }
  } catch (error) {
    consola.error('Failed to process payment_intent.canceled', {
      error: sanitizeError(error),
      eventId,
    });
    throw error;
  }
};
