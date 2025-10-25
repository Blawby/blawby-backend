import type Stripe from 'stripe';
import { paymentLinksRepository } from '../database/queries/payment-links.repository';
import { sendPaymentLinkReceipts } from '../services/payment-link-receipts.service';
import { EventType } from '@/shared/events/enums/event-types';
import { publishSimpleEvent } from '@/shared/events/event-publisher';
import type { BaseEvent } from '@/shared/events/schemas/events.schema';
import { stripe } from '@/shared/utils/stripe-client';

export const handleChargeSucceeded = async (
  event: BaseEvent,
): Promise<void> => {
  const charge = event.payload as unknown as Stripe.Charge;

  // Skip if this charge is not associated with a payment intent
  // (invoice payments don't use payment intents in the same way)
  if (!charge.payment_intent) {
    console.debug(
      {
        chargeId: charge.id,
      },
      'Skipping charge without payment intent',
    );
    return;
  }

  // Find payment link by payment_intent
  const paymentLink = await paymentLinksRepository.findByStripePaymentIntentId(
    charge.payment_intent as string,
  );

  if (!paymentLink) {
    console.warn(`Payment link not found for charge: ${charge.id}`);
    return;
  }

  // Calculate application fee from actual Stripe fees
  const balanceTransaction = await stripe.balanceTransactions.retrieve(
    charge.balance_transaction as string,
  );

  const totalStripeFee = balanceTransaction.fee;
  const applicationFee = Math.round(totalStripeFee * 1.3336); // 1.3336% markup

  // Update payment link
  await paymentLinksRepository.update(paymentLink.id, {
    status: charge.status,
    applicationFee,
    stripeChargeId: charge.id,
  });

  // Send receipts if payment succeeded
  if (charge.status === 'succeeded') {
    await sendPaymentLinkReceipts(paymentLink, charge);
  }

  // Publish simple charge succeeded event
  void publishSimpleEvent(EventType.PAYMENT_SUCCEEDED, 'system', paymentLink.organizationId, {
    payment_link_id: paymentLink.id,
    stripe_charge_id: charge.id,
    stripe_payment_intent_id: charge.payment_intent as string,
    amount: charge.amount,
    currency: charge.currency,
    application_fee: applicationFee,
    succeeded_at: new Date().toISOString(),
  });

  console.info(
    {
      paymentLinkId: paymentLink.id,
      chargeId: charge.id,
      amount: charge.amount,
      applicationFee,
    },
    'Payment link updated from charge.succeeded',
  );
};
