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
    const practiceCustomerIntake = await practiceCustomerIntakesRepository.findByStripePaymentIntentId(
      paymentIntent.id,
    );

    if (!practiceCustomerIntake) {
      return; // Not a practice client intake
    }

    // Update practice client intake status
    await practiceCustomerIntakesRepository.update(practiceCustomerIntake.id, {
      status: 'failed',
    });

    // Publish analytics event
    await publishSimpleEvent(
      EventType.INTAKE_PAYMENT_FAILED,
      'organization',
      practiceCustomerIntake.organizationId,
      {
        intake_payment_id: practiceCustomerIntake.id,
        uuid: practiceCustomerIntake.id,
        amount: practiceCustomerIntake.amount,
        currency: practiceCustomerIntake.currency,
        client_email: practiceCustomerIntake.metadata?.email,
        client_name: practiceCustomerIntake.metadata?.name,
        failure_reason: paymentIntent.last_payment_error?.message,
        failed_at: new Date().toISOString(),
      },
    );

    console.warn('Practice client intake failed', {
      practiceCustomerIntakeId: practiceCustomerIntake.id,
      uuid: practiceCustomerIntake.id,
      amount: practiceCustomerIntake.amount,
      clientEmail: practiceCustomerIntake.metadata?.email,
      failureReason: paymentIntent.last_payment_error?.message,
    });
  } catch (error) {
    console.error('Failed to handle practice client intake failed', {
      error: sanitizeError(error),
      paymentIntentId: paymentIntent.id,
    });
  }
};
