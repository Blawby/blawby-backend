/**
 * Payment Intent Succeeded Webhook Handler
 *
 * Handles payment_intent.succeeded webhook events from Stripe
 * Only processes Payment Link payments (practice client intakes)
 */

import { consola } from 'consola';
import type Stripe from 'stripe';

import { handlePracticeClientIntakeSucceeded } from '@/modules/practice-client-intakes/handlers/succeeded';
import { findPracticeClientIntakeByPaymentIntent } from '@/modules/practice-client-intakes/handlers/helpers';
import { EventType } from '@/shared/events/enums/event-types';
import { publishSimpleEvent } from '@/shared/events/event-publisher';
import { sanitizeError } from '@/shared/utils/logging';

export const handlePaymentIntentSucceeded = async ({
  paymentIntent,
  eventId,
}: {
  paymentIntent: Stripe.PaymentIntent;
  eventId: string;
}): Promise<void> => {
  try {
    const practiceClientIntake = await findPracticeClientIntakeByPaymentIntent(paymentIntent);
    if (practiceClientIntake) {
      await handlePracticeClientIntakeSucceeded({
        paymentIntent,
        eventId,
      });

      const charge = paymentIntent.latest_charge
        ? (typeof paymentIntent.latest_charge === 'string'
          ? paymentIntent.latest_charge
          : paymentIntent.latest_charge.id)
        : undefined;

      void publishSimpleEvent(EventType.PAYMENT_SUCCEEDED, 'organization', practiceClientIntake.organizationId, {
        stripe_payment_intent_id: paymentIntent.id,
        stripe_charge_id: charge,
        amount: paymentIntent.amount,
        currency: paymentIntent.currency,
        intake_payment_id: practiceClientIntake.id,
        succeeded_at: new Date().toISOString(),
      });

      return;
    }

    consola.warn('Payment intent not found in practice client intakes', {
      stripePaymentIntentId: paymentIntent.id,
      hasPaymentLink: 'payment_link' in paymentIntent && !!paymentIntent.payment_link,
    });
  } catch (error) {
    consola.error('Failed to process payment_intent.succeeded webhook', {
      error: sanitizeError(error),
      eventId,
    });
    throw error;
  }
};
