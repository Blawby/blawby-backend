/**
 * Practice Client Intake Succeeded Handler
 *
 * Handles successful payment for practice client intake
 * Updates intake status and publishes INTAKE_PAYMENT_SUCCEEDED event
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

    // Extract latest_charge safely (can be string, Charge object, or null)
    const stripeChargeId = paymentIntent.latest_charge
      ? typeof paymentIntent.latest_charge === 'string'
        ? paymentIntent.latest_charge
        : paymentIntent.latest_charge.id
      : undefined;

    // Update practice client intake status and publish event within transaction
    await db.transaction(async (tx) => {
      await tx
        .update(practiceClientIntakes)
        .set({
          status: 'succeeded',
          stripePaymentIntentId: paymentIntent.id,
          stripeChargeId,
          succeededAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(practiceClientIntakes.id, practiceClientIntake.id));

      // Publish intake-specific event within transaction
      await publishEventTx(tx, {
        type: EventType.INTAKE_PAYMENT_SUCCEEDED,
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
          stripe_charge_id: stripeChargeId,
          succeeded_at: new Date().toISOString(),
        },
      });
    });

    consola.info('Practice client intake payment succeeded', {
      intakeId: practiceClientIntake.id,
      stripePaymentIntentId: paymentIntent.id,
      eventId,
    });
  } catch (error) {
    consola.error('Failed to handle practice client intake succeeded', {
      error: sanitizeError(error),
      paymentIntentId: paymentIntent.id,
    });
    throw error;
  }
};
