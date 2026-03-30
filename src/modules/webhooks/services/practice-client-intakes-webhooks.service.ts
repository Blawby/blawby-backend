/**
 * Practice Client Intakes Webhooks Service
 *
 * Handles processing of Stripe webhook events related to practice client intake payments.
 * Uses the stripe_webhook_events table for storage and processing.
 * Focuses on payment_intent events (succeeded, failed, canceled).
 */

import { getLogger } from '@logtape/logtape';
import type { Stripe } from 'stripe';
import {
  handlePracticeClientIntakeSucceeded,
  handlePracticeClientIntakeFailed,
  handlePracticeClientIntakeCanceled,
  findPracticeClientIntakeByPaymentIntent,
  handlePracticeClientIntakeCheckoutSessionCompleted,
} from '@/modules/practice-client-intakes/webhooks';
import { stripeWebhookEventsRepository } from '@/shared/repositories/stripe.webhook-events.repository';
import { isPaymentIntentEvent, isStripeCheckoutSession, isStripeEvent } from '@/shared/utils/stripeGuards';

const logger = getLogger(['practice-client-intakes', 'webhook-service']);

export const practiceClientIntakesWebhooksService = {
  /**
   * Process practice client intake webhook event
   */
  async processEvent(eventId: string): Promise<void> {
    const webhookEvent = await stripeWebhookEventsRepository.existsByStripeEventId(eventId);

    if (!webhookEvent) {
      logger.error('Webhook event not found: {eventId}', { eventId });
      return;
    }

    if (webhookEvent.processed) {
      logger.info('Webhook event already processed: {eventId}', { eventId });
      return;
    }

    try {
      const event = webhookEvent.payload;

      if (!isStripeEvent(event)) {
        const reason = 'Stored webhook payload is not a valid Stripe event';
        await stripeWebhookEventsRepository.markFailed(webhookEvent.id, reason);
        logger.error('Stored webhook payload is not a valid Stripe event: {eventId}', { eventId: webhookEvent.id });
        throw new Error('Stored webhook payload is invalid');
      }

      if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        if (!isStripeCheckoutSession(session)) {
          const reason = 'Invalid checkout session object in checkout.session.completed event';
          await stripeWebhookEventsRepository.markFailed(webhookEvent.id, reason);
          logger.error('Invalid checkout session object in checkout.session.completed event: {eventId}', {
            eventId: event.id,
          });
          throw new Error('Invalid checkout session payload');
        }
        await handlePracticeClientIntakeCheckoutSessionCompleted(session);
        await stripeWebhookEventsRepository.markProcessed(webhookEvent.id);
        logger.info('Successfully processed practice client intake checkout session event: {eventId}', { eventId });
        return;
      }

      if (isPaymentIntentEvent(event)) {
        if (
          event.type !== 'payment_intent.succeeded' &&
          event.type !== 'payment_intent.payment_failed' &&
          event.type !== 'payment_intent.canceled'
        ) {
          logger.info('Unhandled payment intent event type: {eventType}', { eventType: event.type });
          await stripeWebhookEventsRepository.markProcessed(webhookEvent.id);
          return;
        }

        const paymentIntent = event.data.object;
        const practiceClientIntake = await findPracticeClientIntakeByPaymentIntent(paymentIntent);

        if (!practiceClientIntake) {
          logger.info('Payment intent {paymentIntentId} not associated with practice client intake', {
            paymentIntentId: paymentIntent.id,
          });
          await stripeWebhookEventsRepository.markProcessed(webhookEvent.id);
          return;
        }

        if (event.type === 'payment_intent.succeeded') {
          await this.handlePracticeClientIntakeSucceededWebhook(paymentIntent, event.id);
        } else if (event.type === 'payment_intent.payment_failed') {
          await this.handlePracticeClientIntakeFailedWebhook(paymentIntent, event.id);
        } else if (event.type === 'payment_intent.canceled') {
          await this.handlePracticeClientIntakeCanceledWebhook(paymentIntent, event.id);
        }

        await stripeWebhookEventsRepository.markProcessed(webhookEvent.id);
        logger.info('Successfully processed practice client intake webhook event: {eventId}', { eventId });
        return;
      }

      logger.info('Event type {eventType} is not a practice client intake event, skipping', { eventType: event.type });
      await stripeWebhookEventsRepository.markProcessed(webhookEvent.id);
      return;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;

      await stripeWebhookEventsRepository.markFailed(webhookEvent.id, errorMessage, errorStack);

      logger.error('Failed to process practice client intake webhook event {eventId}: {error}', {
        eventId,
        error: errorMessage,
        stack: errorStack,
      });

      throw error instanceof Error ? error : new Error(errorMessage);
    }
  },

  /**
   * Handle practice client intake payment success
   */
  async handlePracticeClientIntakeSucceededWebhook(
    paymentIntent: Stripe.PaymentIntent,
    eventId?: string
  ): Promise<void> {
    if (!paymentIntent.id) {
      throw new Error('Payment Intent ID missing from payment_intent.succeeded event');
    }

    await handlePracticeClientIntakeSucceeded({
      paymentIntent,
      eventId,
    });
  },

  /**
   * Handle practice client intake payment failure
   */
  async handlePracticeClientIntakeFailedWebhook(paymentIntent: Stripe.PaymentIntent, eventId?: string): Promise<void> {
    if (!paymentIntent.id) {
      throw new Error('Payment Intent ID missing from payment_intent.payment_failed event');
    }

    await handlePracticeClientIntakeFailed({
      paymentIntent,
      eventId,
    });
  },

  /**
   * Handle practice client intake payment cancellation
   */
  async handlePracticeClientIntakeCanceledWebhook(
    paymentIntent: Stripe.PaymentIntent,
    eventId?: string
  ): Promise<void> {
    if (!paymentIntent.id) {
      throw new Error('Payment Intent ID missing from payment_intent.canceled event');
    }

    await handlePracticeClientIntakeCanceled({
      paymentIntent,
      eventId,
    });
  },
};

export default practiceClientIntakesWebhooksService;
