import { consola } from 'consola';
import type Stripe from 'stripe';

import { practiceClientIntakesRepository } from '@/modules/practice-client-intakes/database/queries/practice-client-intakes.repository';
import { EventType } from '@/shared/events/enums/event-types';
import { publishSimpleEvent } from '@/shared/events/event-publisher';
import { sanitizeError } from '@/shared/utils/logging';
import { findPracticeClientIntakeByPaymentIntent } from './helpers';

/**
 * Handle canceled practice client intake
 */
export const handlePracticeClientIntakeCanceled = async (
  paymentIntent: Stripe.PaymentIntent,
): Promise<void> => {
  try {
    const practiceClientIntake = await findPracticeClientIntakeByPaymentIntent(paymentIntent);

    if (!practiceClientIntake) {
      return;
    }

    // Update practice client intake status
    await practiceClientIntakesRepository.update(practiceClientIntake.id, {
      status: 'canceled',
      stripePaymentIntentId: paymentIntent.id, // Populate from Payment Link's Payment Intent
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

    consola.info('Practice client intake canceled', {
      practiceClientIntakeId: practiceClientIntake.id,
      uuid: practiceClientIntake.id,
      amount: practiceClientIntake.amount,
      clientEmail: practiceClientIntake.metadata?.email,
    });
  } catch (error) {
    consola.error('Failed to handle practice client intake canceled', {
      error: sanitizeError(error),
      paymentIntentId: paymentIntent.id,
    });
  }
};
