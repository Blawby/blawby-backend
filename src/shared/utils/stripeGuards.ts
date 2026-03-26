import type Stripe from 'stripe';

/**
 * Generic type for Stripe events where data.object is a specific type
 */
type StripeEventWithObject<T> = Stripe.Event & {
  data: {
    object: T;
  };
};

// Event type prefixes
const PAYMENT_INTENT_PREFIX = 'payment_intent.';
const CHARGE_PREFIX = 'charge.';
const SUBSCRIPTION_PREFIX = 'customer.subscription.';

/**
 * Type Guard: Checks if event is related to Payment Intents.
 * If true, TypeScript knows event.data.object is Stripe.PaymentIntent
 */
const isPaymentIntentEvent = (event: Stripe.Event): event is StripeEventWithObject<Stripe.PaymentIntent> => {
  return event.type.startsWith(PAYMENT_INTENT_PREFIX);
};

/**
 * Type Guard: Checks if event is related to Charges.
 * If true, TypeScript knows event.data.object is Stripe.Charge
 * Also verifies the object is actually a Charge (not a Dispute)
 */
const isChargeEvent = (event: Stripe.Event): event is StripeEventWithObject<Stripe.Charge> => {
  return (
    event.type.startsWith(CHARGE_PREFIX) &&
    event.data?.object &&
    typeof event.data.object === 'object' &&
    'object' in event.data.object &&
    event.data.object.object === 'charge'
  );
};

/**
 * Type Guard: Checks if event is related to Subscriptions.
 * If true, TypeScript knows event.data.object is Stripe.Subscription
 */
const isSubscriptionEvent = (event: Stripe.Event): event is StripeEventWithObject<Stripe.Subscription> => {
  return event.type.startsWith(SUBSCRIPTION_PREFIX);
};

/**
 * Type Guard: Checks if event is related to Products.
 * If true, TypeScript knows event.data.object is Stripe.Product | Stripe.DeletedProduct
 */
const isProductEvent = (event: Stripe.Event): event is StripeEventWithObject<Stripe.Product | Stripe.DeletedProduct> =>
  event.type.startsWith('product.');

/**
 * Type Guard: Checks if event is related to Prices.
 * If true, TypeScript knows event.data.object is Stripe.Price | Stripe.DeletedPrice
 */
const isPriceEvent = (event: Stripe.Event): event is StripeEventWithObject<Stripe.Price | Stripe.DeletedPrice> =>
  event.type.startsWith('price.');

// Default export with all guards
const stripeGuards = {
  isPaymentIntentEvent,
  isChargeEvent,
  isSubscriptionEvent,
  isProductEvent,
  isPriceEvent,
};

export default stripeGuards;

// Named exports for backward compatibility
export { isPaymentIntentEvent, isChargeEvent, isSubscriptionEvent, isProductEvent, isPriceEvent };
