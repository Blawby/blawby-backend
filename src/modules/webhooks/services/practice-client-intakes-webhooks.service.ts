/**
 * Practice Client Intakes Webhooks Service
 *
 * Handles processing of Stripe webhook events related to practice client intake payments.
 * Uses the stripe_webhook_events table for storage and processing.
 * Focuses on payment_intent events (succeeded, failed, canceled).
 */

import type Stripe from 'stripe';

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

/**
 * Process practice client intake webhook event
 */
export const processEvent = async (eventId: string): Promise<void> => {
  const webhookEvent = await existsByStripeEventId(eventId);

  if (!webhookEvent) {
    console.error(`Webhook event not found: ${eventId}`);
    return;
  }

  if (webhookEvent.processed) {
    console.info(`Webhook event already processed: ${eventId}`);
    return;
  }

  try {
    const event = webhookEvent.payload as Stripe.Event;

    if (event.type.startsWith('payment_intent.')) {
      if (event.type !== 'payment_intent.succeeded'
        && event.type !== 'payment_intent.payment_failed'
        && event.type !== 'payment_intent.canceled') {
        console.info(`Unhandled payment intent event type: ${event.type}`);
        await markWebhookProcessed(webhookEvent.id);
        return;
      }

      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      const practiceClientIntake = await findPracticeClientIntakeByPaymentIntent(paymentIntent);

      if (!practiceClientIntake) {
        console.info(`Payment intent ${paymentIntent.id} not associated with practice client intake`);
        await markWebhookProcessed(webhookEvent.id);
        return;
      }

      if (event.type === 'payment_intent.succeeded') {
        await handlePracticeClientIntakeSucceededWebhook(event);
      } else if (event.type === 'payment_intent.payment_failed') {
        await handlePracticeClientIntakeFailedWebhook(event);
      } else if (event.type === 'payment_intent.canceled') {
        await handlePracticeClientIntakeCanceledWebhook(event);
      }

      await markWebhookProcessed(webhookEvent.id);
      console.info(`Successfully processed practice client intake webhook event: ${eventId}`);
      return;
    }

    if (event.type === 'charge.succeeded') {
      const charge = event.data.object as Stripe.Charge;

      if (!charge.payment_intent || typeof charge.payment_intent !== 'string') {
        console.info(`Charge ${charge.id} does not have a payment_intent, skipping practice client intake processing`);
        await markWebhookProcessed(webhookEvent.id);
        return;
      }

      const { stripe } = await import('@/shared/utils/stripe-client');
      const paymentIntent = await stripe.paymentIntents.retrieve(charge.payment_intent);
      const practiceClientIntake = await findPracticeClientIntakeByPaymentIntent(paymentIntent);

      if (!practiceClientIntake) {
        console.info(`Payment intent ${paymentIntent.id} from charge ${charge.id} not associated with practice client intake`);
        await markWebhookProcessed(webhookEvent.id);
        return;
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
      console.info(`Successfully processed practice client intake charge.succeeded webhook event: ${eventId} for charge ${charge.id}`);
      return;
    }

    console.info(`Event type ${event.type} is not a practice client intake event, skipping`);
    await markWebhookProcessed(webhookEvent.id);
    return;
  } catch (error) {
    const errorMessage
      = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : undefined;

    await markWebhookFailed(webhookEvent.id, errorMessage, errorStack);

    console.error(
      {
        eventId,
        error: errorMessage,
        stack: errorStack,
      },
      'Failed to process practice client intake webhook event',
    );

    throw error;
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
