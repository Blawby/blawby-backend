import type Stripe from 'stripe';

/**
 * Generic type for Stripe events where data.object is a specific type
 */
type StripeEventWithObject<T> = Stripe.Event & {
  data: {
    object: T;
  };
};

/**
 * Type Guard: Checks if event is related to Payment Intents.
 * If true, TypeScript knows event.data.object is Stripe.PaymentIntent
 */
export function isPaymentIntentEvent(
  event: Stripe.Event,
): event is StripeEventWithObject<Stripe.PaymentIntent> {
  return event.type.startsWith('payment_intent.');
}

/**
 * Type Guard: Checks if event is related to Charges.
 * If true, TypeScript knows event.data.object is Stripe.Charge
 */
export function isChargeEvent(
  event: Stripe.Event,
): event is StripeEventWithObject<Stripe.Charge> {
  return event.type.startsWith('charge.');
}

/**
 * Type Guard: Checks if event is related to Subscriptions.
 * If true, TypeScript knows event.data.object is Stripe.Subscription
 */
export function isSubscriptionEvent(
  event: Stripe.Event,
): event is StripeEventWithObject<Stripe.Subscription> {
  return event.type.startsWith('customer.subscription.');
}
