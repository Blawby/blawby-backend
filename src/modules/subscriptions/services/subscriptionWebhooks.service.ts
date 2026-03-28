import { getLogger } from '@logtape/logtape';
import type Stripe from 'stripe';
import {
  handleProductCreated,
  handleProductUpdated,
  handleProductDeleted,
  handlePriceCreated,
  handlePriceUpdated,
  handlePriceDeleted,
} from '@/modules/subscriptions/handlers/index';
import type { Result } from '@/shared/types/result';
import { ok, internalError } from '@/shared/utils/result';
import { isProductEvent, isPriceEvent } from '@/shared/utils/stripeGuards';

const logger = getLogger(['subscriptions', 'webhook-service']);

/**
 * Process a Stripe webhook event for subscriptions
 */
const processSubscriptionWebhookEvent = async (event: Stripe.Event): Promise<Result<void>> => {
  try {
    logger.info('Processing subscription webhook event: {eventType}', { eventType: event.type });

    switch (event.type) {
      case 'product.created':
      case 'product.updated':
      case 'product.deleted':
        if (!isProductEvent(event)) {
          return internalError('Unexpected payload for product event');
        }
        if (event.type === 'product.created') {await handleProductCreated(event.data.object);}
        else if (event.type === 'product.updated') {await handleProductUpdated(event.data.object);}
        else {await handleProductDeleted(event.data.object);}
        break;

      case 'price.created':
      case 'price.updated':
      case 'price.deleted':
        if (!isPriceEvent(event)) {
          return internalError('Unexpected payload for price event');
        }
        if (event.type === 'price.created') {await handlePriceCreated(event.data.object);}
        else if (event.type === 'price.updated') {await handlePriceUpdated(event.data.object);}
        else {await handlePriceDeleted(event.data.object);}
        break;

      default:
        logger.info('Unhandled subscription webhook event type: {eventType}', { eventType: event.type });
    }

    logger.info('Successfully processed subscription webhook event: {eventType}', { eventType: event.type });
    return ok(undefined);
  } catch (error) {
    logger.error('Failed to process subscription webhook event {eventType}: {error}', {
      eventType: event.type,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });
    return internalError(error instanceof Error ? error.message : 'Failed to process subscription webhook');
  }
};

/**
 * Check if an event type should be processed by subscription webhooks
 */
const isSubscriptionWebhookEvent = (eventType: string): boolean => eventType.startsWith('product.') || eventType.startsWith('price.');

export const subscriptionWebhooksService = {
  processSubscriptionWebhookEvent,
  isSubscriptionWebhookEvent,
};

export default subscriptionWebhooksService;
