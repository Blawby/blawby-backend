import { getLogger } from '@logtape/logtape';
import type Stripe from 'stripe';
import { type Result, ok, internalError } from '@/shared/types/result';

import {
  handleProductCreated,
  handleProductUpdated,
  handleProductDeleted,
  handlePriceCreated,
  handlePriceUpdated,
  handlePriceDeleted,
} from '../handlers';

const logger = getLogger(['subscriptions', 'webhook-service']);

/**
 * Process a Stripe webhook event for subscriptions
 */
export const processSubscriptionWebhookEvent = async (
  event: Stripe.Event,
): Promise<Result<void>> => {
  try {
    logger.info("Processing subscription webhook event: {eventType}", { eventType: event.type });

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
        logger.info("Unhandled subscription webhook event type: {eventType}", { eventType: event.type });
    }

    logger.info("Successfully processed subscription webhook event: {eventType}", { eventType: event.type });
    return ok(undefined);
  } catch (error) {
    logger.error("Failed to process subscription webhook event {eventType}: {error}", {
      eventType: event.type,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });
    return internalError(
      error instanceof Error ? error.message : 'Failed to process subscription webhook',
    );
  }
};

/**
 * Check if an event type should be processed by subscription webhooks
 */
export const isSubscriptionWebhookEvent = (eventType: string): boolean => {
  return eventType.startsWith('product.') || eventType.startsWith('price.');
};

