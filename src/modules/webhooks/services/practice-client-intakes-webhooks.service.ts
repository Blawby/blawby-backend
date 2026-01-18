/**
 * Practice Client Intakes Webhooks Service
 *
 * Handles processing of Stripe webhook events related to practice client intake payments.
 * Uses the stripe_webhook_events table for storage and processing.
 * Focuses on payment_intent events (succeeded, failed, canceled).
 */

import { getLogger } from '@logtape/logtape';
import type Stripe from 'stripe';
import { type Result, ok, internalError } from '@/shared/types/result';

import {
  handlePracticeClientIntakeSucceeded,
  handlePracticeClientIntakeFailed,
  handlePracticeClientIntakeCanceled,
} from '@/modules/practice-client-intakes/handlers';
import { findPracticeClientIntakeByPaymentIntent } from '@/modules/practice-client-intakes/handlers/helpers';
import {
  existsByStripeEventId,
  markWebhookProcessed,
  markWebhookFailed,
} from '@/shared/repositories/stripe.webhook-events.repository';

const logger = getLogger(['practice-client-intakes', 'webhook-service']);

/**
 * Process practice client intake webhook event
 */
export const processEvent = async (eventId: string): Promise<Result<void>> => {
  const webhookEvent = await existsByStripeEventId(eventId);

  if (!webhookEvent) {
    logger.error("Webhook event not found: {eventId}", { eventId });
    return ok(undefined);
  }

  if (webhookEvent.processed) {
    logger.info("Webhook event already processed: {eventId}", { eventId });
    return ok(undefined);
  }

  try {
    const event = webhookEvent.payload as Stripe.Event;

    if (event.type.startsWith('payment_intent.')) {
      if (event.type !== 'payment_intent.succeeded'
        && event.type !== 'payment_intent.payment_failed'
        && event.type !== 'payment_intent.canceled') {
        logger.info("Unhandled payment intent event type: {eventType}", { eventType: event.type });
        await markWebhookProcessed(webhookEvent.id);
        return ok(undefined);
      }

      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      const practiceClientIntake = await findPracticeClientIntakeByPaymentIntent(paymentIntent);

      if (!practiceClientIntake) {
        logger.info("Payment intent {paymentIntentId} not associated with practice client intake", {
          paymentIntentId: paymentIntent.id
        });
        await markWebhookProcessed(webhookEvent.id);
        return ok(undefined);
      }

      if (event.type === 'payment_intent.succeeded') {
        await handlePracticeClientIntakeSucceededWebhook(event);
      } else if (event.type === 'payment_intent.payment_failed') {
        await handlePracticeClientIntakeFailedWebhook(event);
      } else if (event.type === 'payment_intent.canceled') {
        await handlePracticeClientIntakeCanceledWebhook(event);
      }

      await markWebhookProcessed(webhookEvent.id);
      logger.info("Successfully processed practice client intake webhook event: {eventId}", { eventId });
      return ok(undefined);
    }

    if (event.type === 'charge.succeeded') {
      const charge = event.data.object as Stripe.Charge;

      if (!charge.payment_intent || typeof charge.payment_intent !== 'string') {
        logger.info("Charge {chargeId} does not have a payment_intent, skipping practice client intake processing", {
          chargeId: charge.id
        });
        await markWebhookProcessed(webhookEvent.id);
        return ok(undefined);
      }

      const { stripe } = await import('@/shared/utils/stripe-client');
      const paymentIntent = await stripe.paymentIntents.retrieve(charge.payment_intent);
      const practiceClientIntake = await findPracticeClientIntakeByPaymentIntent(paymentIntent);

      if (!practiceClientIntake) {
        logger.info("Payment intent {paymentIntentId} from charge {chargeId} not associated with practice client intake", {
          paymentIntentId: paymentIntent.id,
          chargeId: charge.id
        });
        await markWebhookProcessed(webhookEvent.id);
        return ok(undefined);
      }

      const syntheticEvent = {
        ...event,
        type: 'payment_intent.succeeded' as const,
        data: {
          object: paymentIntent,
        },
      } as unknown as Stripe.Event;

      await handlePracticeClientIntakeSucceededWebhook(syntheticEvent);
      await markWebhookProcessed(webhookEvent.id);
      logger.info("Successfully processed practice client intake charge.succeeded webhook event: {eventId} for charge {chargeId}", {
        eventId,
        chargeId: charge.id
      });
      return ok(undefined);
    }

    logger.info("Event type {eventType} is not a practice client intake event, skipping", { eventType: event.type });
    await markWebhookProcessed(webhookEvent.id);
    return ok(undefined);
  } catch (error) {
    const errorMessage
      = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : undefined;

    await markWebhookFailed(webhookEvent.id, errorMessage, errorStack);

    logger.error("Failed to process practice client intake webhook event {eventId}: {error}", {
      eventId,
      error: errorMessage,
      stack: errorStack,
    });

    return internalError(errorMessage);
  }
};

const handlePracticeClientIntakeSucceededWebhook = async (
  event: Stripe.Event,
): Promise<void> => {
  const paymentIntent = event.data.object as Stripe.PaymentIntent;

  if (!paymentIntent.id) {
    throw new Error('Payment Intent ID missing from payment_intent.succeeded event');
  }

  await handlePracticeClientIntakeSucceeded({
    paymentIntent,
    eventId: event.id,
  });
};

const handlePracticeClientIntakeFailedWebhook = async (
  event: Stripe.Event,
): Promise<void> => {
  const paymentIntent = event.data.object as Stripe.PaymentIntent;

  if (!paymentIntent.id) {
    throw new Error('Payment Intent ID missing from payment_intent.payment_failed event');
  }

  await handlePracticeClientIntakeFailed({
    paymentIntent,
    eventId: event.id,
  });
};

const handlePracticeClientIntakeCanceledWebhook = async (
  event: Stripe.Event,
): Promise<void> => {
  const paymentIntent = event.data.object as Stripe.PaymentIntent;

  if (!paymentIntent.id) {
    throw new Error('Payment Intent ID missing from payment_intent.canceled event');
  }

  await handlePracticeClientIntakeCanceled({
    paymentIntent,
    eventId: event.id,
  });
};
