/**
 * Price Updated Webhook Handler
 *
 * Handles Stripe price.updated webhook events
 * Updates the price record in the database
 * Does NOT modify is_active — that's our own control flag
 */

import type Stripe from 'stripe';
import { getLogger } from '@logtape/logtape';
import { db } from '@/shared/database';
import { subscriptionRepository } from '@/modules/subscriptions/database/queries/subscription.repository';

const logger = getLogger(['subscriptions', 'handlers', 'price-updated']);

/**
 * Handle price.updated webhook event
 */
export const handlePriceUpdated = async (price: Stripe.Price): Promise<void> => {
  try {
    logger.info('Processing price.updated: {priceId}', { priceId: price.id });

    // Find the price
    const existingPrice = await subscriptionRepository.findPriceByStripeId(db, price.id);

    if (!existingPrice) {
      logger.warn('Price not found for price.updated: {priceId}', { priceId: price.id });
      return;
    }

    // Update price fields (but NOT is_active — that's ours to control)
    const updates = {
      ...existingPrice,
      currency: price.currency,
      unit_amount: price.unit_amount ?? 0,
      interval: price.recurring?.interval ?? null,
      interval_count: price.recurring?.interval_count ?? null,
      billing_scheme: price.billing_scheme ?? null,
      metadata: price.metadata ?? {},
      updated_at: new Date(),
    };

    await subscriptionRepository.upsertPrice(db, updates);
    logger.info('Successfully updated price: {priceId}', { priceId: price.id });
  } catch (error) {
    logger.error('Failed to process price.updated: {priceId}. Error: {error}', {
      priceId: price.id,
      error,
    });
    throw error;
  }
};
