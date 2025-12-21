import type Stripe from 'stripe';

import { practiceClientIntakesRepository } from '../database/queries/practice-client-intakes.repository';
import { EventType } from '@/shared/events/enums/event-types';
import { publishSimpleEvent } from '@/shared/events/event-publisher';
import { sanitizeError } from '@/shared/utils/logging';

/**
 * Handle canceled practice client intake
 */
export const handlePracticeClientIntakeCanceled = async function handlePracticeCustomerIntakeCanceled(
  paymentIntent: Stripe.PaymentIntent,
): Promise<void> {
  try {
    // Find practice client intake by Stripe payment intent ID
    const practiceClientIntake = await practiceClientIntakesRepository.findByStripePaymentIntentId(
      paymentIntent.id,
    );

    if (!practiceClientIntake) {
      return; // Not a practice client intake
    }

    // Update practice client intake status
    await practiceClientIntakesRepository.update(practiceClientIntake.id, {
      status: 'canceled',
    });

    // Publish analytics event
    void publishSimpleEvent(
      EventType.INTAKE_PAYMENT_CANCELED,
      'organization',
      practiceClientIntake.organizationId,
      {
        intake_payment_id: practiceClientIntake.id,
        uuid: practiceClientIntake.id,
        amount: practiceClientIntake.amount,
        currency: practiceClientIntake.currency,
        client_email: practiceClientIntake.metadata?.email,
        client_name: practiceClientIntake.metadata?.name,
        canceled_at: new Date().toISOString(),
      },
    );

    console.info('Practice client intake canceled', {
      practiceClientIntakeId: practiceClientIntake.id,
      uuid: practiceClientIntake.id,
      amount: practiceClientIntake.amount,
      clientEmail: practiceClientIntake.metadata?.email,
    });
  } catch (error) {
    console.error('Failed to handle practice client intake canceled', {
      error: sanitizeError(error),
      paymentIntentId: paymentIntent.id,
    });
  }
};
