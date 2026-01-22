/**
 * Price Deleted Webhook Handler
 *
 * Handles Stripe price.deleted webhook events
 * Removes the price from the subscription plan
 */

import type Stripe from 'stripe';
import { getLogger } from '@logtape/logtape';

import { db } from '@/shared/database';
import { subscriptionRepository } from '../database/queries/subscription.repository';

const logger = getLogger(['subscriptions', 'handlers', 'price-deleted']);

/**
 * Handle price.deleted webhook event
 */
export const handlePriceDeleted = async (price: Stripe.Price): Promise<void> => {
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

    if (plan.stripeMonthlyPriceId === price.id) {
      updates.stripeMonthlyPriceId = null;
      updates.monthlyPrice = null;

      // If this was the only price, deactivate the plan
      if (!plan.stripeYearlyPriceId) {
        updates.isActive = false;
      }
    }

    if (plan.stripeYearlyPriceId === price.id) {
      updates.stripeYearlyPriceId = null;
      updates.yearlyPrice = null;

      // If this was the only price, deactivate the plan
      if (!plan.stripeMonthlyPriceId) {
        updates.isActive = false;
      }
    }

    // Handle metered items
    if (plan.meteredItems && Array.isArray(plan.meteredItems)) {
      const meteredItems = (plan.meteredItems as any[]).filter((item) => item.priceId !== price.id);
      if (meteredItems.length !== (plan.meteredItems as any[]).length) {
        updates.meteredItems = meteredItems;
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
      error
    });
    throw error;
  }
};
