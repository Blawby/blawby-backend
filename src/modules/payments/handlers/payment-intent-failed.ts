/**
 * Payment Intent Failed Webhook Handler
 *
 * Handles payment_intent.payment_failed webhook events from Stripe
 * Only processes Payment Link payments (practice client intakes)
 */

import { consola } from 'consola';
import type Stripe from 'stripe';

import { handlePracticeClientIntakeFailed } from '@/modules/practice-client-intakes/handlers/failed';
import { findPracticeClientIntakeByPaymentIntent } from '@/modules/practice-client-intakes/handlers/helpers';
import { EventType } from '@/shared/events/enums/event-types';
import { publishSimpleEvent } from '@/shared/events/event-publisher';
import { sanitizeError } from '@/shared/utils/logging';

export const handlePaymentIntentFailed = async ({
  paymentIntent,
  eventId,
}: {
  paymentIntent: Stripe.PaymentIntent;
  eventId: string;
}): Promise<void> => {
  try {
    const practiceClientIntake = await findPracticeClientIntakeByPaymentIntent(paymentIntent);
    if (practiceClientIntake) {
      await handlePracticeClientIntakeFailed(paymentIntent);

      void publishSimpleEvent(EventType.PAYMENT_FAILED, 'organization', practiceClientIntake.organizationId, {
        stripe_payment_intent_id: paymentIntent.id,
        amount: paymentIntent.amount,
        currency: paymentIntent.currency,
        intake_payment_id: practiceClientIntake.id,
        error_message: paymentIntent.last_payment_error?.message,
        error_code: paymentIntent.last_payment_error?.code,
        failed_at: new Date().toISOString(),
      });

      return;
    }

    consola.warn('Payment intent not found in practice client intakes', {
      stripePaymentIntentId: paymentIntent.id,
      hasPaymentLink: 'payment_link' in paymentIntent && !!paymentIntent.payment_link,
      errorMessage: paymentIntent.last_payment_error?.message,
    });
  } catch (error) {
    consola.error('Failed to process payment_intent.payment_failed webhook', {
      error: sanitizeError(error),
      eventId,
    });
    throw error;
  }
};
