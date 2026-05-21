/**
 * Stripe Client Service
 *
 * Provides a lazily-initialized Stripe client instance
 */

import { Stripe } from 'stripe';
import { config } from '@/shared/config';

// Lazy initialization of Stripe client
let _stripeInstance: Stripe | null = null;

/**
 * Initialize and return Stripe client instance
 */
const initStripe = (): Stripe => {
  if (!_stripeInstance) {
    const apiKey = config.stripe.secretKey;
    if (!apiKey) {
      throw new Error('STRIPE_SECRET_KEY environment variable is required');
    }

    _stripeInstance = new Stripe(apiKey, {
      apiVersion: '2026-02-25.clover',
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
  get(_, prop): unknown {
    const client = initStripe();
    const value = client[prop as keyof Stripe];

    // Bind methods to maintain correct 'this' context
    return typeof value === 'function' ? value.bind(client) : value;
  },
});

/**
 * Get direct Stripe instance (not Proxy)
 * Useful for libraries that need a direct Stripe instance (e.g., Better Auth Stripe plugin)
 * Usage: import { getStripeInstance } from './stripe-client'
 *        const stripeClient = getStripeInstance()
 */
export const getStripeInstance = (): Stripe => initStripe();
