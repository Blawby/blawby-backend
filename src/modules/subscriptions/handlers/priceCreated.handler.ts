/**
 * Price Created Webhook Handler
 *
 * Handles Stripe price.created webhook events
 * Updates the subscription plan with the new price
 */

import type { Stripe } from 'stripe';
import { getLogger } from '@logtape/logtape';

import { db } from '@/shared/database';
import { subscriptionRepository } from '@/modules/subscriptions/database/queries/subscription.repository';
import type { MeteredItem } from '@/modules/subscriptions/constants/meteredProducts';

const logger = getLogger(['subscriptions', 'handlers', 'price-created']);

/**
 * Handle price.created webhook event
 */
export const handlePriceCreated = async (price: Stripe.Price): Promise<void> => {
  try {
    logger.info('Processing price.created: {priceId} for product {productId}', {
      priceId: price.id,
      productId: typeof price.product === 'string' ? price.product : price.product.id,
    });

    // Find the plan for this product
    const productId = typeof price.product === 'string' ? price.product : price.product.id;
    const plan = await subscriptionRepository.findPlanByStripeProductId(db, productId);

    if (!plan) {
      logger.warn('Plan not found for price.created: {priceId}, product: {productId}', {
        priceId: price.id,
        productId,
      });
      return;
    }

    // Determine if this is a monthly or yearly price
    const interval = price.recurring?.interval;

    // Update the plan with the new price
    const updates: Record<string, unknown> = {};

    if (interval === 'month' && !plan.stripe_monthly_price_id) {
      updates.stripe_monthly_price_id = price.id;
      updates.monthly_price = price.unit_amount ? (price.unit_amount / 100).toString() : null;
    } else if (interval === 'year' && !plan.stripe_yearly_price_id) {
      updates.stripe_yearly_price_id = price.id;
      updates.yearly_price = price.unit_amount ? (price.unit_amount / 100).toString() : null;
    } else if (price.recurring?.usage_type === 'metered') {
      // Handle metered price - add to metered_items array
      const meteredItems: MeteredItem[] = plan.metered_items ?? [];
      meteredItems.push({
        price_id: price.id,
        meter_name: price.nickname ?? 'metered',
        type: price.metadata?.meter_type ?? 'usage',
      });
      updates.metered_items = meteredItems;
    }

    if (Object.keys(updates).length > 0) {
      await subscriptionRepository.upsertPlan(db, {
        ...plan,
        ...updates,
      });

      logger.info('Successfully updated plan with new price: {priceId}', { priceId: price.id });
    } else {
      logger.debug('No updates needed for price: {priceId}', { priceId: price.id });
    }
  } catch (error) {
    logger.error('Failed to process price.created: {priceId}. Error: {error}', {
      priceId: price.id,
      error,
    });
    throw error;
  }
};
