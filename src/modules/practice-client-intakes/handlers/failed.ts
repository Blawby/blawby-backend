/**
 * Practice Client Intake Failed Handler
 *
 * Handles failed payment for practice client intake
 * Updates intake status and publishes INTAKE_PAYMENT_FAILED event
 */

import { consola } from 'consola';
import type Stripe from 'stripe';
import { eq } from 'drizzle-orm';

import { practiceClientIntakesRepository } from '@/modules/practice-client-intakes/database/queries/practice-client-intakes.repository';
import { practiceClientIntakes } from '@/modules/practice-client-intakes/database/schema/practice-client-intakes.schema';
import { findPracticeClientIntakeByPaymentIntent } from '@/modules/practice-client-intakes/handlers/helpers';
import { EventType } from '@/shared/events/enums/event-types';
import { publishEventTx } from '@/shared/events/event-publisher';
import { WEBHOOK_ACTOR_UUID } from '@/shared/events/constants';
import { sanitizeError } from '@/shared/utils/logging';
import { db } from '@/shared/database';

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
      await publishEventTx(tx, {
        type: EventType.INTAKE_PAYMENT_FAILED,
        actorId: WEBHOOK_ACTOR_UUID,
        actorType: 'webhook',
        organizationId: practiceClientIntake.organizationId,
        payload: {
          event_id: eventId,
          stripe_payment_intent_id: paymentIntent.id,
          intake_payment_id: practiceClientIntake.id,
          uuid: practiceClientIntake.id,
          amount: practiceClientIntake.amount,
          currency: practiceClientIntake.currency,
          client_email: practiceClientIntake.metadata?.email,
          client_name: practiceClientIntake.metadata?.name,
          failure_reason: paymentIntent.last_payment_error?.message,
          failed_at: new Date().toISOString(),
        },
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
