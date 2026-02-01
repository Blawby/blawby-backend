/**
 * Practice Client Intakes Webhooks Service
 *
 * Handles processing of Stripe webhook events related to practice client intake payments.
 * Uses the stripe_webhook_events table for storage and processing.
 * Focuses on payment_intent events (succeeded, failed, canceled).
 */

import { getLogger } from '@logtape/logtape';
import type Stripe from 'stripe';
import {
  handlePracticeClientIntakeSucceeded,
  handlePracticeClientIntakeFailed,
  handlePracticeClientIntakeCanceled,
} from '@/modules/practice-client-intakes/handlers';
import { findPracticeClientIntakeByPaymentIntent } from '@/modules/practice-client-intakes/handlers/helpers';
import { stripeWebhookEventsRepository } from '@/shared/repositories/stripe.webhook-events.repository';
import type { Result } from '@/shared/types/result';
import { ok, internalError } from '@/shared/utils/result';

const logger = getLogger(['practice-client-intakes', 'webhook-service']);

export const practiceClientIntakesWebhooksService = {
  /**
   * Process practice client intake webhook event
   */
  async processEvent(eventId: string): Promise<Result<void>> {
    const webhookEvent = await stripeWebhookEventsRepository.existsByStripeEventId(eventId);

    if (!webhookEvent) {
      logger.error('Webhook event not found: {eventId}', { eventId });
      return ok(undefined);
    }

    if (webhookEvent.processed) {
      logger.info('Webhook event already processed: {eventId}', { eventId });
      return ok(undefined);
    }

    try {
      const event = webhookEvent.payload as Stripe.Event;

      if (event.type.startsWith('payment_intent.')) {
        if (
          event.type !== 'payment_intent.succeeded'
          && event.type !== 'payment_intent.payment_failed'
          && event.type !== 'payment_intent.canceled'
        ) {
          logger.info('Unhandled payment intent event type: {eventType}', { eventType: event.type });
          await stripeWebhookEventsRepository.markProcessed(webhookEvent.id);
          return ok(undefined);
        }

        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        const practiceClientIntake = await findPracticeClientIntakeByPaymentIntent(paymentIntent);

        if (!practiceClientIntake) {
          logger.info('Payment intent {paymentIntentId} not associated with practice client intake', {
            paymentIntentId: paymentIntent.id,
          });
          await stripeWebhookEventsRepository.markProcessed(webhookEvent.id);
          return ok(undefined);
        }

        if (event.type === 'payment_intent.succeeded') {
          await this.handlePracticeClientIntakeSucceededWebhook(event);
        } else if (event.type === 'payment_intent.payment_failed') {
          await this.handlePracticeClientIntakeFailedWebhook(event);
        } else if (event.type === 'payment_intent.canceled') {
          await this.handlePracticeClientIntakeCanceledWebhook(event);
        }

        await stripeWebhookEventsRepository.markProcessed(webhookEvent.id);
        logger.info('Successfully processed practice client intake webhook event: {eventId}', { eventId });
        return ok(undefined);
      }

      logger.info('Event type {eventType} is not a practice client intake event, skipping', { eventType: event.type });
      await stripeWebhookEventsRepository.markProcessed(webhookEvent.id);
      return ok(undefined);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;

      await stripeWebhookEventsRepository.markFailed(webhookEvent.id, errorMessage, errorStack);

      logger.error('Failed to process practice client intake webhook event {eventId}: {error}', {
        eventId,
        error: errorMessage,
        stack: errorStack,
      });

      return internalError(errorMessage);
    }
  },

  /**
   * Handle practice client intake payment success
   */
  async handlePracticeClientIntakeSucceededWebhook(event: Stripe.Event): Promise<void> {
    const paymentIntent = event.data.object as Stripe.PaymentIntent;

    if (!paymentIntent.id) {
      throw new Error('Payment Intent ID missing from payment_intent.succeeded event');
    }

    await handlePracticeClientIntakeSucceeded({
      paymentIntent,
      eventId: event.id,
    });
  },

  /**
   * Handle practice client intake payment failure
   */
  async handlePracticeClientIntakeFailedWebhook(event: Stripe.Event): Promise<void> {
    const paymentIntent = event.data.object as Stripe.PaymentIntent;

    if (!paymentIntent.id) {
      throw new Error('Payment Intent ID missing from payment_intent.payment_failed event');
    }

    await handlePracticeClientIntakeFailed({
      paymentIntent,
      eventId: event.id,
    });
  },

  /**
   * Handle practice client intake payment cancellation
   */
  async handlePracticeClientIntakeCanceledWebhook(event: Stripe.Event): Promise<void> {
    const paymentIntent = event.data.object as Stripe.PaymentIntent;

    if (!paymentIntent.id) {
      throw new Error('Payment Intent ID missing from payment_intent.canceled event');
    }

    await handlePracticeClientIntakeCanceled({
      paymentIntent,
      eventId: event.id,
    });
  },
};

export default practiceClientIntakesWebhooksService;
