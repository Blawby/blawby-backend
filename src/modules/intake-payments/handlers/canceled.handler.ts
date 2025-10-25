import type Stripe from 'stripe';

import { intakePaymentsRepository } from '../database/queries/intake-payments.repository';
import { EventType } from '@/shared/events/enums/event-types';
import { publishSimpleEvent } from '@/shared/events/event-publisher';
import { sanitizeError } from '@/shared/utils/logging';

/**
 * Handle canceled intake payment
 */
export const handleIntakePaymentCanceled = async function handleIntakePaymentCanceled(
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
      status: 'canceled',
    });

    // Publish analytics event
    void publishSimpleEvent(
      EventType.INTAKE_PAYMENT_CANCELED,
      'organization',
      intakePayment.organizationId,
      {
        intake_payment_id: intakePayment.id,
        ulid: intakePayment.ulid,
        amount: intakePayment.amount,
        currency: intakePayment.currency,
        customer_email: intakePayment.metadata?.email,
        customer_name: intakePayment.metadata?.name,
        canceled_at: new Date().toISOString(),
      },
    );

    console.info('Intake payment canceled', {
      intakePaymentId: intakePayment.id,
      ulid: intakePayment.ulid,
      amount: intakePayment.amount,
      customerEmail: intakePayment.metadata?.email,
    });
  } catch (error) {
    console.error('Failed to handle intake payment canceled', {
      error: sanitizeError(error),
      paymentIntentId: paymentIntent.id,
    });
  }
};
