/**
 * Practice Client Intake Failed Handler
 *
 * Handles failed payment for practice client intake
 * Updates intake status and publishes INTAKE_PAYMENT_FAILED event
 */

import { consola } from 'consola';
import { eq } from 'drizzle-orm';
import type Stripe from 'stripe';
import { practiceClientIntakes } from '@/modules/practice-client-intakes/database/schema/practice-client-intakes.schema';
import { findPracticeClientIntakeByPaymentIntent } from '@/modules/practice-client-intakes/handlers/helpers';
import { db } from '@/shared/database';
import { IntakePaymentFailed } from '@/shared/events/definitions';
import { WEBHOOK_ACTOR_UUID } from '@/shared/events/event';
import { sanitizeError } from '@/shared/utils/logging';

/**
 * Handle failed practice client intake payment
 */
export const handlePracticeClientIntakeFailed = async ({
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
          status: 'failed',
          stripePaymentIntentId: paymentIntent.id,
          updatedAt: new Date(),
        })
        .where(eq(practiceClientIntakes.id, practiceClientIntake.id));

      // Publish intake-specific event within transaction
      await IntakePaymentFailed.dispatch({
        stripe_payment_intent_id: paymentIntent.id,
        intake_payment_id: practiceClientIntake.id,
        error: paymentIntent.last_payment_error?.message,
      }, {
        actorId: WEBHOOK_ACTOR_UUID,
        actorType: 'webhook',
        organizationId: practiceClientIntake.organizationId,
        tx,
      });
    });

    consola.warn('Practice client intake payment failed', {
      intakeId: practiceClientIntake.id,
      stripePaymentIntentId: paymentIntent.id,
      failureReason: paymentIntent.last_payment_error?.message,
      eventId,
    });
  } catch (error) {
    consola.error('Failed to handle practice client intake failed', {
      error: sanitizeError(error),
      paymentIntentId: paymentIntent.id,
    });
    throw error;
  }
};
