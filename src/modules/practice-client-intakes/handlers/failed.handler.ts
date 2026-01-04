import type Stripe from 'stripe';

import { practiceClientIntakesRepository } from '../database/queries/practice-client-intakes.repository';
import { EventType } from '@/shared/events/enums/event-types';
import { publishSimpleEvent } from '@/shared/events/event-publisher';
import { sanitizeError } from '@/shared/utils/logging';

/**
 * Handle failed practice client intake
 */
export const handlePracticeClientIntakeFailed = async function handlePracticeCustomerIntakeFailed(
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
      status: 'failed',
    });

    // Publish analytics event
    await publishSimpleEvent(
      EventType.INTAKE_PAYMENT_FAILED,
      'organization',
      practiceClientIntake.organizationId,
      {
        intake_payment_id: practiceClientIntake.id,
        uuid: practiceClientIntake.id,
        amount: practiceClientIntake.amount,
        currency: practiceClientIntake.currency,
        client_email: practiceClientIntake.metadata?.email,
        client_name: practiceClientIntake.metadata?.name,
        failure_reason: paymentIntent.last_payment_error?.message,
        failed_at: new Date().toISOString(),
      },
    );

    console.warn('Practice client intake failed', {
      practiceClientIntakeId: practiceClientIntake.id,
      uuid: practiceClientIntake.id,
      amount: practiceClientIntake.amount,
      clientEmail: practiceClientIntake.metadata?.email,
      failureReason: paymentIntent.last_payment_error?.message,
    });
  } catch (error) {
    console.error('Failed to handle practice client intake failed', {
      error: sanitizeError(error),
      paymentIntentId: paymentIntent.id,
    });
  }
};
