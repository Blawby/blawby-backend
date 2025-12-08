/**
 * Subscription Webhooks Service
 *
 * Processes Stripe webhook events for subscription products and prices
 */

import type Stripe from 'stripe';

import {
  handleProductCreated,
  handleProductUpdated,
  handleProductDeleted,
  handlePriceCreated,
  handlePriceUpdated,
  handlePriceDeleted,
} from '../handlers';

/**
 * Process a Stripe webhook event for subscriptions
 */
export const processSubscriptionWebhookEvent = async (
  event: Stripe.Event,
): Promise<void> => {
  try {
    console.log(`Processing subscription webhook event: ${event.type}`);

    switch (event.type) {
      case 'product.created':
        await handleProductCreated(event.data.object as Stripe.Product);
        break;

      case 'product.updated':
        await handleProductUpdated(event.data.object as Stripe.Product);
        break;

      case 'product.deleted':
        await handleProductDeleted(event.data.object as Stripe.Product);
        break;

      case 'price.created':
        await handlePriceCreated(event.data.object as Stripe.Price);
        break;

      case 'price.updated':
        await handlePriceUpdated(event.data.object as Stripe.Price);
        break;

      case 'price.deleted':
        await handlePriceDeleted(event.data.object as Stripe.Price);
        break;

      default:
        console.log(`Unhandled subscription webhook event type: ${event.type}`);
    }

    console.log(`Successfully processed subscription webhook event: ${event.type}`);
  } catch (error) {
    console.error(
      `Failed to process subscription webhook event: ${event.type}`,
      error,
    );
    throw error;
  }
};

/**
 * Check if an event type should be processed by subscription webhooks
 */
export const isSubscriptionWebhookEvent = (eventType: string): boolean => {
  return eventType.startsWith('product.') || eventType.startsWith('price.');
};

