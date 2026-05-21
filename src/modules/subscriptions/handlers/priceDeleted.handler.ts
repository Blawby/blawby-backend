/**
 * Price Deleted Webhook Handler
 *
 * Handles Stripe price.deleted webhook events
 * Removes the price from the database and deactivates plan if no prices remain
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

    // Find the price
    const existingPrice = await subscriptionRepository.findPriceByStripeId(db, price.id);

    if (!existingPrice) {
      logger.warn('Price not found for price.deleted: {priceId}', { priceId: price.id });
      return;
    }

    // Delete the price
    await subscriptionRepository.deletePrice(db, price.id);

    // If the price had a plan, check if there are any active prices left
    if (existingPrice.plan_id) {
      const remainingActiveCount = await subscriptionRepository.countActivePricesForPlan(db, existingPrice.plan_id);

      if (remainingActiveCount === 0) {
        // No active prices left, deactivate the plan
        logger.info('No active prices remain for plan {planId}, deactivating plan', { planId: existingPrice.plan_id });
        const plan = await subscriptionRepository.findPlanById(db, existingPrice.plan_id);
        if (plan) {
          await subscriptionRepository.deactivatePlan(db, plan.stripe_product_id);
        }
      }
    }

    logger.info('Successfully deleted price: {priceId}', { priceId: price.id });
  } catch (error) {
    logger.error('Failed to process price.deleted: {priceId}. Error: {error}', {
      priceId: price.id,
      error,
    });
    throw error;
  }
};
