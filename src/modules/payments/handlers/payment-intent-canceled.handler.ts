/**
 * Payment Intent Canceled Webhook Handler
 *
 * Handles payment_intent.canceled webhook events from Stripe
 * Updates payment intent status and publishes events
 */

import { paymentIntentsRepository } from '@/modules/payments/database/queries/payment-intents.repository';
import { EventType } from '@/shared/events/enums/event-types';
import { publishSimpleEvent } from '@/shared/events/event-publisher';
import type { BaseEvent } from '@/shared/events/schemas/events.schema';
import { handleIntakePaymentCanceled } from '@/modules/intake-payments/handlers/canceled.handler';
import type Stripe from 'stripe';

export const handlePaymentIntentCanceled
  = async function handlePaymentIntentCanceled(
    event: BaseEvent,
  ): Promise<void> {
    try {
      const paymentIntentData = event.payload as {
        id: string;
        cancellation_reason?: string;
      };

      const paymentIntent
        = await paymentIntentsRepository.findByStripePaymentIntentId(
          paymentIntentData.id,
        );

      if (!paymentIntent) {
        console.warn(`Payment intent not found: ${paymentIntentData.id}`);
        return;
      }

      await paymentIntentsRepository.update(paymentIntent.id, {
        status: 'canceled',
        metadata: {
          cancellationReason: paymentIntentData.cancellation_reason,
          canceledAt: new Date().toISOString(),
        } as Record<string, unknown>,
      });

      // Check if this is an intake payment and handle it
      await handleIntakePaymentCanceled(paymentIntentData as Stripe.PaymentIntent);

      // Publish simple payment canceled event
      void publishSimpleEvent(EventType.PAYMENT_CANCELED, 'system', event.organizationId || 'unknown', {
        payment_intent_id: paymentIntent.id,
        stripe_payment_intent_id: paymentIntentData.id,
        amount: paymentIntent.amount,
        currency: paymentIntent.currency,
        cancellation_reason: paymentIntentData.cancellation_reason,
        canceled_at: new Date().toISOString(),
      });

      console.info(`Payment canceled: ${paymentIntent.id}`);
    } catch (error) {
      console.error({ error }, 'Failed to process payment_intent.canceled');
      throw error;
    }
  };
