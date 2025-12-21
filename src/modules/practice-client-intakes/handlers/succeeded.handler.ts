import { consola } from 'consola';
import type Stripe from 'stripe';

import { practiceClientIntakesRepository } from '../database/queries/practice-client-intakes.repository';
import { EventType } from '@/shared/events/enums/event-types';
import { publishSimpleEvent } from '@/shared/events/event-publisher';
import { sanitizeError } from '@/shared/utils/logging';

/**
 * Handle successful practice client intake
 */
export const handlePracticeClientIntakeSucceeded = async function handlePracticeClientIntakeSucceeded(
  paymentIntent: Stripe.PaymentIntent,
): Promise<void> {
  try {
    // Find practice client intake by Stripe payment intent ID
    const practiceClientIntake = await practiceClientIntakesRepository.findByStripePaymentIntentId(
      paymentIntent.id,
    );

    if (!practiceClientIntake) {
      return;
    }

    // Update practice client intake status
    await practiceClientIntakesRepository.update(practiceClientIntake.id, {
      status: 'succeeded',
      stripeChargeId: paymentIntent.latest_charge as string,
      succeededAt: new Date(),
    });

    // Publish analytics event
    void publishSimpleEvent(
      EventType.INTAKE_PAYMENT_SUCCEEDED,
      'organization',
      practiceClientIntake.organizationId,
      {
        intake_payment_id: practiceClientIntake.id,
        uuid: practiceClientIntake.id,
        amount: practiceClientIntake.amount,
        currency: practiceClientIntake.currency,
        client_email: practiceClientIntake.metadata?.email,
        client_name: practiceClientIntake.metadata?.name,
        stripe_charge_id: paymentIntent.latest_charge,
        succeeded_at: new Date().toISOString(),
      },
    );

    consola.info('Practice client intake succeeded', {
      practiceClientIntakeId: practiceClientIntake.id,
      uuid: practiceClientIntake.id,
      amount: practiceClientIntake.amount,
      clientEmail: practiceClientIntake.metadata?.email,
    });
  } catch (error) {
    consola.error('Failed to handle practice client intake succeeded', {
      error: sanitizeError(error),
      paymentIntentId: paymentIntent.id,
    });
  }
};

/**
 * Handle failed practice client intake
 */
export const handlePracticeClientIntakeFailed = async function handlePracticeClientIntakeFailed(
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

/**
 * Handle canceled practice client intake
 */
export const handlePracticeClientIntakeCanceled = async function handlePracticeClientIntakeCanceled(
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
    await publishSimpleEvent(
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
