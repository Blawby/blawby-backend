import { consola } from 'consola';
import type Stripe from 'stripe';

import { practiceClientIntakesRepository } from '@/modules/practice-client-intakes/database/queries/practice-client-intakes.repository';
import { EventType } from '@/shared/events/enums/event-types';
import { publishSimpleEvent } from '@/shared/events/event-publisher';
import { sanitizeError } from '@/shared/utils/logging';
import { findPracticeClientIntakeByPaymentIntent } from './helpers';

/**
 * Handle failed practice client intake
 */
export const handlePracticeClientIntakeFailed = async (paymentIntent: Stripe.PaymentIntent): Promise<void> => {
  try {
    const practiceClientIntake = await findPracticeClientIntakeByPaymentIntent(paymentIntent);

    if (!practiceClientIntake) {
      return;
    }

    // Update practice client intake status
    await practiceClientIntakesRepository.update(practiceClientIntake.id, {
      status: 'failed',
      stripePaymentIntentId: paymentIntent.id, // Populate from Payment Link's Payment Intent
    });

    // Publish analytics event
    void publishSimpleEvent(
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

    consola.warn('Practice client intake failed', {
      practiceClientIntakeId: practiceClientIntake.id,
      uuid: practiceClientIntake.id,
      amount: practiceClientIntake.amount,
      clientEmail: practiceClientIntake.metadata?.email,
      failureReason: paymentIntent.last_payment_error?.message,
    });
  } catch (error) {
    consola.error('Failed to handle practice client intake failed', {
      error: sanitizeError(error),
      paymentIntentId: paymentIntent.id,
    });
  }
};
