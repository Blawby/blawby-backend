/**
 * Price Updated Webhook Handler
 *
 * Handles Stripe price.updated webhook events
 * Updates the subscription plan with the modified price
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

    // Find the plan that uses this price
    const plan = await subscriptionRepository.findPlanByStripePriceId(db, price.id);

    if (!plan) {
      logger.warn('Plan not found for price.updated: {priceId}', { priceId: price.id });
      return;
    }

    // Update the plan with the new price amount
    const updates: Record<string, unknown> = {};

    if (plan.stripeMonthlyPriceId === price.id) {
      updates.monthlyPrice = price.unit_amount ? (price.unit_amount / 100).toString() : null;
    }

    if (plan.stripeYearlyPriceId === price.id) {
      updates.yearlyPrice = price.unit_amount ? (price.unit_amount / 100).toString() : null;
    }

    // Update currency if changed
    if (price.currency && price.currency !== plan.currency) {
      updates.currency = price.currency;
    }

    // Update active status
    if (price.active !== undefined) {
      // If this is the only price and it's deactivated, deactivate the plan
      if (!price.active && plan.stripeMonthlyPriceId === price.id && !plan.stripeYearlyPriceId) {
        updates.isActive = false;
      } else if (!price.active && plan.stripeYearlyPriceId === price.id && !plan.stripeMonthlyPriceId) {
        updates.isActive = false;
      }
    }

    if (Object.keys(updates).length > 0) {
      await subscriptionRepository.upsertPlan(db, {
        ...plan,
        ...updates,
      });

      logger.info('Successfully updated plan with modified price: {priceId}', { priceId: price.id });
    } else {
      logger.debug('No updates needed for price: {priceId}', { priceId: price.id });
    }
  } catch (error) {
    logger.error('Failed to process price.updated: {priceId}. Error: {error}', { priceId: price.id, error });
    throw error;
  }
};
