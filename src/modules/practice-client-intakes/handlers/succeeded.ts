/**
 * Practice Client Intake Succeeded Handler
 *
 * Handles successful payment for practice client intake
 * Updates intake status and publishes INTAKE_PAYMENT_SUCCEEDED event
 */

import { getLogger } from '@logtape/logtape';
import { and, eq } from 'drizzle-orm';
import type Stripe from 'stripe';
import {
  practiceClientIntakes,
} from '@/modules/practice-client-intakes/database/schema/practice-client-intakes.schema';
import { findPracticeClientIntakeByPaymentIntent } from '@/modules/practice-client-intakes/handlers/helpers';
import { db } from '@/shared/database';
import { IntakePaymentSucceeded } from '@/shared/events/definitions';
import { WEBHOOK_ACTOR_UUID } from '@/shared/events/event';
import { sanitizeError } from '@/shared/utils/logging';

const logger = getLogger(['practice-client-intakes', 'handlers', 'succeeded']);

/**
 * Handle successful practice client intake payment
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

    // Deduplication: If already succeeded, don't process again
    if (practiceClientIntake.status === 'succeeded') {
      return;
    }

    // Extract latest_charge safely (can be string, Charge object, or null)
    const stripeChargeId = paymentIntent.latest_charge
      ? typeof paymentIntent.latest_charge === 'string'
        ? paymentIntent.latest_charge
        : paymentIntent.latest_charge.id
      : undefined;

    // Update practice client intake status and publish event within transaction
    await db.transaction(async (tx) => {
      const updateResult = await tx
        .update(practiceClientIntakes)
        .set({
          status: 'succeeded',
          stripe_payment_intent_id: paymentIntent.id,
          stripe_charge_id: stripeChargeId,
          succeeded_at: new Date(),
          updated_at: new Date(),
        })
        .where(
          and(
            eq(practiceClientIntakes.id, practiceClientIntake.id),
            eq(practiceClientIntakes.status, 'open'),
          ),
        );

      // Only publish event if this specific request was the one that flipped the status to 'succeeded'
      if (updateResult.rowCount === 1) {
        // Publish intake-specific event within transaction
        await IntakePaymentSucceeded.dispatch({
          event_id: eventId,
          organization_id: practiceClientIntake.organization_id,
          stripe_payment_intent_id: paymentIntent.id,
          intake_payment_id: practiceClientIntake.id,
          uuid: practiceClientIntake.id,
          amount: practiceClientIntake.amount,
          currency: practiceClientIntake.currency,
          client_email: practiceClientIntake.metadata?.email as string | undefined,
          client_name: practiceClientIntake.metadata?.name as string | undefined,
          user_id: practiceClientIntake.metadata?.user_id as string | undefined,
          stripe_charge_id: stripeChargeId,
          succeeded_at: new Date().toISOString(),
        }, {
          actorId: WEBHOOK_ACTOR_UUID,
          actorType: 'webhook',
          organizationId: practiceClientIntake.organization_id,
          tx,
        });

        logger.info('Practice client intake status updated to succeeded', {
          intakeId: practiceClientIntake.id,
          stripePaymentIntentId: paymentIntent.id,
        });
      } else {
        logger.info('Practice client intake status already updated, skipping event dispatch', {
          intakeId: practiceClientIntake.id,
        });
      }
    });

    // Link user and create user details record is now handled solely by the IntakePaymentSucceeded event listener
    // in src/modules/user-details/listeners.ts to prevent duplicate processing.

    logger.info('Practice client intake payment succeeded and user linked', {
      intakeId: practiceClientIntake.id,
      stripePaymentIntentId: paymentIntent.id,
      eventId,
    });
  } catch (error) {
    logger.error('Failed to handle practice client intake succeeded', {
      error: sanitizeError(error),
      paymentIntentId: paymentIntent.id,
    });
    throw error;
  }
};
