/**
 * Payment Intent Succeeded Webhook Handler
 *
 * Handles payment_intent.succeeded webhook events from Stripe
 * Processes successful direct payments
 */

import { paymentIntentsRepository } from '../database/queries/payment-intents.repository';
import { connectedAccountsRepository } from '@/modules/onboarding/database/queries/connected-accounts.repository';
import { EventType } from '@/shared/events/enums/event-types';
import { publishSimpleEvent } from '@/shared/events/event-publisher';
import type { BaseEvent } from '@/shared/events/schemas/events.schema';
import { handlePracticeClientIntakeSucceeded } from '@/modules/practice-client-intakes/handlers/succeeded.handler';
import type Stripe from 'stripe';

export const handlePaymentIntentSucceeded
  = async function handlePaymentIntentSucceeded(
    event: BaseEvent,
  ): Promise<void> {
    try {
      const paymentIntentData = event.payload as {
        id: string;
        amount: number;
        currency: string;
        payment_method?: string;
        charges?: {
          data: Array<{
            id: string;
            receipt_url?: string;
          }>;
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

      // 3. Update payment intent with success details
      const charge = paymentIntentData.charges?.data[0];
      await paymentIntentsRepository.update(paymentIntent.id, {
        status: 'succeeded',
        paymentMethodId: paymentIntentData.payment_method,
        stripeChargeId: charge?.id,
        receiptUrl: charge?.receipt_url,
        succeededAt: new Date(),
      });


      // 5. Publish simple payment succeeded event
      void publishSimpleEvent(EventType.PAYMENT_SUCCEEDED, 'system', connectedAccount.organization_id, {
        payment_intent_id: paymentIntent.id,
        stripe_payment_intent_id: paymentIntentData.id,
        amount: paymentIntentData.amount,
        currency: paymentIntentData.currency,
        customer_id: paymentIntent.customerId,
        application_fee_amount: paymentIntent.applicationFeeAmount,
        receipt_url: charge?.receipt_url,
        succeeded_at: new Date().toISOString(),
      });

      // 6. Check if this is a practice client intake and handle it
      await handlePracticeClientIntakeSucceeded(paymentIntentData as Stripe.PaymentIntent);

      // 7. Send receipt if email provided
      if (paymentIntent.receiptEmail && charge?.receipt_url) {
        // TODO: Implement receipt email sending
        console.info(`Receipt sent to: ${paymentIntent.receiptEmail}`);
      }

      console.info(
        `Payment succeeded: ${paymentIntent.id} - $${paymentIntentData.amount / 100}`,
      );
    } catch (error) {
      console.error(
        { error, eventId: event.eventId },
        'Failed to process payment_intent.succeeded webhook',
      );
      throw error;
    }
  };
