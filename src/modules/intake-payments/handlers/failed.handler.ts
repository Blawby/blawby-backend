import type Stripe from 'stripe';

import { intakePaymentsRepository } from '../database/queries/intake-payments.repository';
import { EventType } from '@/shared/events/enums/event-types';
import { publishSimpleEvent } from '@/shared/events/event-publisher';
import { sanitizeError } from '@/shared/utils/logging';

/**
 * Handle failed intake payment
 */
export const handleIntakePaymentFailed = async function handleIntakePaymentFailed(
  paymentIntent: Stripe.PaymentIntent,
): Promise<void> {
  try {
    // Find intake payment by Stripe payment intent ID
    const intakePayment = await intakePaymentsRepository.findByStripePaymentIntentId(
      paymentIntent.id,
    );

    if (!intakePayment) {
      return; // Not an intake payment
    }

    // Update intake payment status
    await intakePaymentsRepository.update(intakePayment.id, {
      status: 'failed',
    });

    // Publish analytics event
    await publishSimpleEvent(
      EventType.INTAKE_PAYMENT_FAILED,
      'organization',
      intakePayment.organizationId,
      {
        intake_payment_id: intakePayment.id,
        ulid: intakePayment.ulid,
        amount: intakePayment.amount,
        currency: intakePayment.currency,
        customer_email: intakePayment.metadata?.email,
        customer_name: intakePayment.metadata?.name,
        failure_reason: paymentIntent.last_payment_error?.message,
        failed_at: new Date().toISOString(),
      },
    );

    console.warn('Intake payment failed', {
      intakePaymentId: intakePayment.id,
      ulid: intakePayment.ulid,
      amount: intakePayment.amount,
      customerEmail: intakePayment.metadata?.email,
      failureReason: paymentIntent.last_payment_error?.message,
    });
  } catch (error) {
    console.error('Failed to handle intake payment failed', {
      error: sanitizeError(error),
      paymentIntentId: paymentIntent.id,
    });
  }
};
