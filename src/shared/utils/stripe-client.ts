/**
 * Stripe Client Service
 *
 * Provides a lazily-initialized Stripe client instance
 */

import Stripe from 'stripe';

// Lazy initialization of Stripe client
let _stripeInstance: Stripe | null = null;

/**
 * Initialize and return Stripe client instance
 */
const initStripe = (): Stripe => {
  if (!_stripeInstance) {
    const apiKey = process.env.STRIPE_SECRET_KEY;
    if (!apiKey) {
      throw new Error('STRIPE_SECRET_KEY environment variable is required');
    }

    _stripeInstance = new Stripe(apiKey, {
      apiVersion: '2025-09-30.clover',
    });
  }

  return _stripeInstance;
};

/**
 * Stripe client instance (lazy-initialized via Proxy)
 * Usage: import { stripe } from './stripe-client.service'
 *        stripe.customers.list(...)
 */
export const stripe = new Proxy({} as Stripe, {
  // oxlint-disable-next-line explicit-function-return-type
  get(_, prop) {
    const client = initStripe();
    const value = client[prop as keyof Stripe];

    // Bind methods to maintain correct 'this' context
    return typeof value === 'function' ? value.bind(client) : value;
  },
});
