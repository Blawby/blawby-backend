import type Stripe from 'stripe';

import { practiceClientIntakesRepository } from '@/modules/practice-client-intakes/database/queries/practice-client-intakes.repository';
import type { SelectPracticeClientIntake } from '@/modules/practice-client-intakes/database/schema/practice-client-intakes.schema';

/**
 * Find practice client intake by Payment Intent or Payment Link ID
 * Payment Links create Payment Intents, so we need to check both
 */
export const findPracticeClientIntakeByPaymentIntent = async (
  paymentIntent: Stripe.PaymentIntent,
): Promise<SelectPracticeClientIntake | undefined> => {
  // Try to find by Stripe payment intent ID first (if it was already stored)
  let practiceClientIntake = await practiceClientIntakesRepository.findByStripePaymentIntentId(
    paymentIntent.id,
  );

  // If not found, try to find by Payment Link ID (Payment Links create Payment Intents)
  // payment_link may be present when Payment Intent is created via Payment Link
  if (!practiceClientIntake && 'payment_link' in paymentIntent && paymentIntent.payment_link) {
    const paymentLinkId: string | undefined = typeof paymentIntent.payment_link === 'string'
      ? paymentIntent.payment_link
      : (typeof paymentIntent.payment_link === 'object'
        && paymentIntent.payment_link !== null
        && 'id' in paymentIntent.payment_link
        && typeof paymentIntent.payment_link.id === 'string'
        ? paymentIntent.payment_link.id
        : undefined);
    if (paymentLinkId) {
      practiceClientIntake = await practiceClientIntakesRepository.findByStripePaymentLinkId(
        paymentLinkId,
      );
    }
  }

  // Last resort: try to find by intake_uuid from metadata
  if (!practiceClientIntake && typeof paymentIntent.metadata?.intake_uuid === 'string') {
    practiceClientIntake = await practiceClientIntakesRepository.findById(
      paymentIntent.metadata.intake_uuid,
    );
  }

  return practiceClientIntake;
};
