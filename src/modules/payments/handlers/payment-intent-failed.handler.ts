/**
 * Payment Intent Failed Webhook Handler
 *
 * Handles payment_intent.payment_failed webhook events from Stripe
 * Processes failed payment attempts
 */

import { connectedAccountsRepository } from '@/modules/onboarding/database/queries/connected-accounts.repository';
import { paymentIntentsRepository } from '@/modules/payments/database/queries/payment-intents.repository';
import { handlePracticeClientIntakeFailed } from '@/modules/practice-client-intakes/handlers/failed.handler';
import { EventType } from '@/shared/events/enums/event-types';
import { publishSimpleEvent } from '@/shared/events/event-publisher';
import type { BaseEvent } from '@/shared/events/schemas/events.schema';
import type Stripe from 'stripe';

export const handlePaymentIntentFailed
  = async function handlePaymentIntentFailed(
    event: BaseEvent,
  ): Promise<void> {
    try {
      const paymentIntentData = event.payload as {
        id: string;
        amount: number;
        currency: string;
        last_payment_error?: {
          message: string;
          code: string;
          type: string;
        };
        metadata?: Record<string, unknown>;
      };

      // 1. Find payment intent in database
      const paymentIntent
        = await paymentIntentsRepository.findByStripePaymentIntentId(
          paymentIntentData.id,
        );
      if (!paymentIntent) {
        console.warn(
          `Payment intent not found in database: ${paymentIntentData.id}`,
        );
        return;
      }

      // 2. Get connected account
      const connectedAccount = await connectedAccountsRepository.findById(
        paymentIntent.connectedAccountId,
      );
      if (!connectedAccount) {
        console.error(
          `Connected account not found for payment intent: ${paymentIntent.id}`,
        );
        return;
      }

      // 3. Update payment intent with failure details
      await paymentIntentsRepository.update(paymentIntent.id, {
        status: 'canceled', // Failed payments are marked as canceled
      });

      // 4. Check if this is a practice client intake and handle it
      await handlePracticeClientIntakeFailed(paymentIntentData as Stripe.PaymentIntent);

      // Publish simple payment failed event
      void publishSimpleEvent(EventType.PAYMENT_FAILED, 'system', connectedAccount.organization_id, {
        payment_intent_id: paymentIntent.id,
        stripe_payment_intent_id: paymentIntentData.id,
        amount: paymentIntentData.amount,
        currency: paymentIntentData.currency,
        customer_id: paymentIntent.customerId,
        error_message: paymentIntentData.last_payment_error?.message,
        error_code: paymentIntentData.last_payment_error?.code,
        failed_at: new Date().toISOString(),
      });

      console.info(
        `Payment failed: ${paymentIntent.id} - $${paymentIntentData.amount / 100}`,
      );
    } catch (error) {
      console.error(
        { error, eventId: event.eventId },
        'Failed to process payment_intent.payment_failed webhook',
      );
      throw error;
    }
  };
