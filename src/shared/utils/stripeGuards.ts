import type { Stripe } from 'stripe';

/**
 * Generic type for Stripe events where data.object is a specific type
 */
type StripeEventWithObject<T> = Stripe.Event & {
  data: {
    object: T;
  };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

// Event type prefixes
const PAYMENT_INTENT_PREFIX = 'payment_intent.';
const CHARGE_PREFIX = 'charge.';
const SUBSCRIPTION_PREFIX = 'customer.subscription.';
const PRODUCT_EVENT_PREFIX = 'product.';
const PRICE_EVENT_PREFIX = 'price.';

/**
 * Type Guard: Checks if event is related to Payment Intents.
 * If true, TypeScript knows event.data.object is Stripe.PaymentIntent
 */
const isPaymentIntentEvent = (event: Stripe.Event): event is StripeEventWithObject<Stripe.PaymentIntent> =>
  event.type.startsWith(PAYMENT_INTENT_PREFIX);

/**
 * Type Guard: Checks if event is related to Charges.
 * If true, TypeScript knows event.data.object is Stripe.Charge
 * Also verifies the object is actually a Charge (not a Dispute)
 */
const isChargeEvent = (event: Stripe.Event): event is StripeEventWithObject<Stripe.Charge> =>
  event.type.startsWith(CHARGE_PREFIX) &&
  event.data?.object &&
  typeof event.data.object === 'object' &&
  'object' in event.data.object &&
  event.data.object.object === 'charge';

/**
 * Type Guard: Checks if a value is a Stripe Account object.
 */
const isStripeAccount = (obj: unknown): obj is Stripe.Account =>
  isRecord(obj) && obj.object === 'account' && typeof obj.id === 'string';

/**
 * Type Guard: Checks if a value is a Stripe Capability object.
 */
const isStripeCapability = (obj: unknown): obj is Stripe.Capability =>
  isRecord(obj) && obj.object === 'capability' && typeof obj.id === 'string' && typeof obj.account === 'string';

/**
 * Type Guard: Checks if a value is a Stripe External Account object.
 */
const isStripeExternalAccount = (obj: unknown): obj is Stripe.ExternalAccount =>
  isRecord(obj) && typeof obj.id === 'string' && (obj.object === 'bank_account' || obj.object === 'card');

/**
 * Type Guard: Checks if a value is a Stripe Checkout Session object.
 */
const isStripeCheckoutSession = (obj: unknown): obj is Stripe.Checkout.Session =>
  isRecord(obj) && obj.object === 'checkout.session' && typeof obj.id === 'string';

/**
 * Type Guard: Checks if a value is a Stripe Invoice object.
 */
const isStripeInvoice = (obj: unknown): obj is Stripe.Invoice => isRecord(obj) && obj.object === 'invoice';

/**
 * Type Guard: Checks if a value is a Stripe Payment Intent object.
 */
const isStripePaymentIntent = (obj: unknown): obj is Stripe.PaymentIntent =>
  isRecord(obj) && obj.object === 'payment_intent';

/**
 * Type Guard: Checks if a value is a Stripe Event object.
 */
const isStripeEvent = (obj: unknown): obj is Stripe.Event =>
  isRecord(obj) &&
  typeof obj.id === 'string' &&
  typeof obj.type === 'string' &&
  isRecord(obj.data) &&
  isRecord(obj.data.object);

/**
 * Type Guard: Checks if event is related to Subscriptions.
 * If true, TypeScript knows event.data.object is Stripe.Subscription
 */
const isSubscriptionEvent = (event: Stripe.Event): event is StripeEventWithObject<Stripe.Subscription> =>
  event.type.startsWith(SUBSCRIPTION_PREFIX);

/**
 * Type Guard: Checks if event is related to Products.
 * If true, TypeScript knows event.data.object is Stripe.Product | Stripe.DeletedProduct
 */
const isProductEvent = (event: Stripe.Event): event is StripeEventWithObject<Stripe.Product | Stripe.DeletedProduct> =>
  event.type.startsWith(PRODUCT_EVENT_PREFIX);

/**
 * Type Guard: Checks if event is related to Prices.
 * If true, TypeScript knows event.data.object is Stripe.Price | Stripe.DeletedPrice
 */
const isPriceEvent = (event: Stripe.Event): event is StripeEventWithObject<Stripe.Price | Stripe.DeletedPrice> =>
  event.type.startsWith(PRICE_EVENT_PREFIX);

export {
  isPaymentIntentEvent,
  isChargeEvent,
  isSubscriptionEvent,
  isProductEvent,
  isPriceEvent,
  isStripeEvent,
  isStripeAccount,
  isStripeCapability,
  isStripeExternalAccount,
  isStripeCheckoutSession,
  isStripeInvoice,
  isStripePaymentIntent,
};
