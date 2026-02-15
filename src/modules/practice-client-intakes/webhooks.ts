/**
 * Practice Client Intake Webhook Handlers
 */

import { getLogger } from '@logtape/logtape';
import { and, eq, not, inArray } from 'drizzle-orm';
import type { Stripe } from 'stripe';
import { practiceClientIntakesRepository } from '@/modules/practice-client-intakes/database/queries/practice-client-intakes.repository';
import {
  practiceClientIntakes,
} from '@/modules/practice-client-intakes/database/schema/practice-client-intakes.schema';
import type { SelectPracticeClientIntake } from '@/modules/practice-client-intakes/database/schema/practice-client-intakes.schema';
import { db } from '@/shared/database';
import {
  IntakePaymentSucceeded,
  IntakePaymentFailed,
  IntakePaymentCanceled,
} from '@/shared/events/definitions';
import { WEBHOOK_ACTOR_UUID } from '@/shared/events/event';
import { sanitizeError } from '@/shared/utils/logging';

const logger = getLogger(['practice-client-intakes', 'webhooks']);

/**
 * Find practice client intake by Payment Intent or Payment Link ID
 */
export const findPracticeClientIntakeByPaymentIntent = async (
  paymentIntent: Stripe.PaymentIntent,
): Promise<SelectPracticeClientIntake | undefined> => {
  let practiceClientIntake = await practiceClientIntakesRepository.findByStripePaymentIntentId(
    paymentIntent.id,
  );

  if (!practiceClientIntake && 'payment_link' in paymentIntent && paymentIntent.payment_link) {
    const paymentLinkId: string | undefined = typeof paymentIntent.payment_link === 'string'
      ? paymentIntent.payment_link
      : (typeof paymentIntent.payment_link === 'object'
        && paymentIntent.payment_link !== null
        && 'id' in paymentIntent.payment_link
        && typeof paymentIntent.payment_link.id === 'string'
        ? paymentIntent.payment_link.id
        : undefined);
    if (paymentLinkId) {
      practiceClientIntake = await practiceClientIntakesRepository.findByStripePaymentLinkId(
        paymentLinkId,
      );
    }
  }

  if (!practiceClientIntake && typeof paymentIntent.metadata?.intake_uuid === 'string') {
    practiceClientIntake = await practiceClientIntakesRepository.findById(
      paymentIntent.metadata.intake_uuid,
    );
  }

  return practiceClientIntake;
};

/**
 * Find practice client intake by Checkout Session
 */
export const findPracticeClientIntakeByCheckoutSession = async (
  session: Stripe.Checkout.Session,
): Promise<SelectPracticeClientIntake | undefined> => {
  let practiceClientIntake = await practiceClientIntakesRepository.findByStripeCheckoutSessionId(
    session.id,
  );

  if (!practiceClientIntake && typeof session.client_reference_id === 'string') {
    practiceClientIntake = await practiceClientIntakesRepository.findById(
      session.client_reference_id,
    );
  }

  if (!practiceClientIntake && typeof session.metadata?.intake_uuid === 'string') {
    practiceClientIntake = await practiceClientIntakesRepository.findById(
      session.metadata.intake_uuid,
    );
  }

  return practiceClientIntake;
};

/**
 * Handle successful payment
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
    if (!practiceClientIntake || practiceClientIntake.status === 'succeeded') {
      return;
    }

    const stripeChargeId = paymentIntent.latest_charge
      ? typeof paymentIntent.latest_charge === 'string'
        ? paymentIntent.latest_charge
        : paymentIntent.latest_charge.id
      : undefined;

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

      if (updateResult.rowCount === 1) {
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
      }
    });

    logger.info('Payment succeeded and processed', { intakeId: practiceClientIntake.id });
  } catch (error) {
    logger.error('Failed to handle succeeded payment', { error: sanitizeError(error), paymentIntentId: paymentIntent.id });
    throw error;
  }
};

/**
 * Handle failed payment
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
    if (!practiceClientIntake) return;

    await db.transaction(async (tx) => {
      const updateResult = await tx
        .update(practiceClientIntakes)
        .set({
          status: 'failed',
          stripe_payment_intent_id: paymentIntent.id,
          updated_at: new Date(),
        })
        .where(
          and(
            eq(practiceClientIntakes.id, practiceClientIntake.id),
            eq(practiceClientIntakes.status, 'open'),
          ),
        );

      if (updateResult.rowCount === 1) {
        await IntakePaymentFailed.dispatch({
          stripe_payment_intent_id: paymentIntent.id,
          intake_payment_id: practiceClientIntake.id,
          error: paymentIntent.last_payment_error?.message,
        }, {
          actorId: WEBHOOK_ACTOR_UUID,
          actorType: 'webhook',
          organizationId: practiceClientIntake.organization_id,
          tx,
        });
      }
    });

    logger.warn('Payment failed', { intakeId: practiceClientIntake.id, eventId });
  } catch (error) {
    logger.error('Failed to handle failed payment', { error: sanitizeError(error), paymentIntentId: paymentIntent.id });
    throw error;
  }
};

/**
 * Handle canceled payment
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
    if (!practiceClientIntake) return;

    await db.transaction(async (tx) => {
      const updateResult = await tx
        .update(practiceClientIntakes)
        .set({
          status: 'canceled',
          stripe_payment_intent_id: paymentIntent.id,
          updated_at: new Date(),
        })
        .where(
          and(
            eq(practiceClientIntakes.id, practiceClientIntake.id),
            eq(practiceClientIntakes.status, 'open'),
          ),
        );

      if (updateResult.rowCount === 1) {
        await IntakePaymentCanceled.dispatch({
          stripe_payment_intent_id: paymentIntent.id,
          intake_payment_id: practiceClientIntake.id,
        }, {
          actorId: WEBHOOK_ACTOR_UUID,
          actorType: 'webhook',
          organizationId: practiceClientIntake.organization_id,
          tx,
        });
      }
    });

    logger.info('Payment canceled', { intakeId: practiceClientIntake.id, eventId });
  } catch (error) {
    logger.error('Failed to handle canceled payment', { error: sanitizeError(error), paymentIntentId: paymentIntent.id });
    throw error;
  }
};

/**
 * Handle checkout session completed
 */
export const handlePracticeClientIntakeCheckoutSessionCompleted = async (
  session: Stripe.Checkout.Session,
): Promise<void> => {
  try {
    const practiceClientIntake = await findPracticeClientIntakeByCheckoutSession(session);
    if (!practiceClientIntake) {
      logger.info('Checkout session not associated with practice client intake', { sessionId: session.id });
      return;
    }

    // Only update if not in a terminal state
    const terminalStatuses = ['succeeded', 'failed', 'canceled', 'converted'];
    if (terminalStatuses.includes(practiceClientIntake.status)) {
      logger.info('Checkout session completed but intake already in terminal state', {
        intakeId: practiceClientIntake.id,
        status: practiceClientIntake.status,
        sessionId: session.id,
      });
      return;
    }

    await db
      .update(practiceClientIntakes)
      .set({
        stripe_checkout_session_id: session.id,
        status: 'open',
        updated_at: new Date(),
      })
      .where(
        and(
          eq(practiceClientIntakes.id, practiceClientIntake.id),
          not(inArray(practiceClientIntakes.status, terminalStatuses)),
        ),
      );

    logger.info('Checkout session completed and linked', { intakeId: practiceClientIntake.id });
  } catch (error) {
    logger.error('Failed to handle checkout session completed', { error: sanitizeError(error), sessionId: session.id });
    throw error;
  }
};
