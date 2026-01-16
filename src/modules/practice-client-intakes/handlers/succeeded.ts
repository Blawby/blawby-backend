import { consola } from 'consola';
import type Stripe from 'stripe';

import { practiceClientIntakesRepository } from '@/modules/practice-client-intakes/database/queries/practice-client-intakes.repository';
import { EventType } from '@/shared/events/enums/event-types';
import { publishSimpleEvent } from '@/shared/events/event-publisher';
import { sanitizeError } from '@/shared/utils/logging';
import { findPracticeClientIntakeByPaymentIntent } from './helpers';

/**
 * Handle successful practice client intake
 */
export const handlePracticeClientIntakeSucceeded = async ({
  paymentIntent,
  eventId,
}: {
  paymentIntent: Stripe.PaymentIntent;
  eventId?: string;
}): Promise<void> => {
  try {
    const practiceClientIntake = await findPracticeClientIntakeByPaymentIntent(paymentIntent);

    if (!practiceClientIntake) {
      return;
    }

    // Update practice client intake status
    // Payment Links use 'completed' status, but we store as 'succeeded' for consistency
    await practiceClientIntakesRepository.update(practiceClientIntake.id, {
      status: 'succeeded',
      stripePaymentIntentId: paymentIntent.id, // Populate from Payment Link's Payment Intent
      stripeChargeId: paymentIntent.latest_charge as string,
      succeededAt: new Date(),
    });

    // Publish analytics event
    void publishSimpleEvent(
      EventType.INTAKE_PAYMENT_SUCCEEDED,
      'organization',
      practiceClientIntake.organizationId,
      {
        event_id: eventId,
        stripe_payment_intent_id: paymentIntent.id,
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
