/**
 * Practice Client Intake Canceled Handler
 *
 * Handles canceled payment for practice client intake
 * Updates intake status and publishes INTAKE_PAYMENT_CANCELED event
 */

import { consola } from 'consola';
import { eq } from 'drizzle-orm';
import type Stripe from 'stripe';
import { practiceClientIntakes } from '@/modules/practice-client-intakes/database/schema/practice-client-intakes.schema';
import { findPracticeClientIntakeByPaymentIntent } from '@/modules/practice-client-intakes/handlers/helpers';
import { db } from '@/shared/database';
import { IntakePaymentCanceled } from '@/shared/events/definitions';
import { WEBHOOK_ACTOR_UUID } from '@/shared/events/event';
import { sanitizeError } from '@/shared/utils/logging';

/**
 * Handle canceled practice client intake payment
 */
export const handlePracticeClientIntakeCanceled = async ({
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

    // Update practice client intake status and publish event within transaction
    await db.transaction(async (tx) => {
      await tx
        .update(practiceClientIntakes)
        .set({
          status: 'canceled',
          stripePaymentIntentId: paymentIntent.id,
          updatedAt: new Date(),
        })
        .where(eq(practiceClientIntakes.id, practiceClientIntake.id));

      // Publish intake-specific event within transaction
      await IntakePaymentCanceled.dispatch({
        stripe_payment_intent_id: paymentIntent.id,
        intake_payment_id: practiceClientIntake.id,
      }, {
        actorId: WEBHOOK_ACTOR_UUID,
        actorType: 'webhook',
        organizationId: practiceClientIntake.organizationId,
        tx,
      });
    });

    consola.info('Practice client intake payment canceled', {
      intakeId: practiceClientIntake.id,
      stripePaymentIntentId: paymentIntent.id,
      eventId,
    });
  } catch (error) {
    consola.error('Failed to handle practice client intake canceled', {
      error: sanitizeError(error),
      paymentIntentId: paymentIntent.id,
    });
    throw error;
  }
};
