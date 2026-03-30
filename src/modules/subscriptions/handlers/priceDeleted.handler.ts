/**
 * Price Deleted Webhook Handler
 *
 * Handles Stripe price.deleted webhook events
 * Removes the price from the subscription plan
 */

import type Stripe from 'stripe';
import { getLogger } from '@logtape/logtape';

import { db } from '@/shared/database';
import { subscriptionRepository } from '@/modules/subscriptions/database/queries/subscription.repository';

const logger = getLogger(['subscriptions', 'handlers', 'price-deleted']);

/**
 * Handle price.deleted webhook event
 */
export const handlePriceDeleted = async (price: Stripe.Price | Stripe.DeletedPrice): Promise<void> => {
  try {
    logger.info('Processing price.deleted: {priceId}', { priceId: price.id });

    // Find the plan that uses this price
    const plan = await subscriptionRepository.findPlanByStripePriceId(db, price.id);

    if (!plan) {
      logger.warn('Plan not found for price.deleted: {priceId}', { priceId: price.id });
      return;
    }

    // Remove the price from the plan
    const updates: Record<string, unknown> = {};

    if (plan.stripe_monthly_price_id === price.id) {
      updates.stripe_monthly_price_id = null;
      updates.monthly_price = null;

      // If this was the only price, deactivate the plan
      if (!plan.stripe_yearly_price_id) {
        updates.is_active = false;
      }
    }

    if (plan.stripe_yearly_price_id === price.id) {
      updates.stripe_yearly_price_id = null;
      updates.yearly_price = null;

      // If this was the only price, deactivate the plan
      if (!plan.stripe_monthly_price_id) {
        updates.is_active = false;
      }
    }

    // Handle metered items
    if (plan.metered_items && Array.isArray(plan.metered_items)) {
      const metered_items = (plan.metered_items as any[]).filter((item) => item.price_id !== price.id);
      if (metered_items.length !== (plan.metered_items as any[]).length) {
        updates.metered_items = metered_items;
      }
    }

    if (Object.keys(updates).length > 0) {
      await subscriptionRepository.upsertPlan(db, {
        ...plan,
        ...updates,
      });

      logger.info('Successfully removed price from plan: {priceId}', { priceId: price.id });
    } else {
      logger.debug('No updates needed for price deletion: {priceId}', { priceId: price.id });
    }
  } catch (error) {
    logger.error('Failed to process price.deleted: {priceId}. Error: {error}', {
      priceId: price.id,
      error,
    });
    throw error;
  }
};
