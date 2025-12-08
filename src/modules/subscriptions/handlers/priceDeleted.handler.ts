/**
 * Price Deleted Webhook Handler
 *
 * Handles Stripe price.deleted webhook events
 * Removes the price from the subscription plan
 */

import type Stripe from 'stripe';

import { db } from '@/shared/database';
import { findPlanByStripePriceId, upsertPlan } from '../database/queries/subscriptionPlans.repository';

/**
 * Handle price.deleted webhook event
 */
export const handlePriceDeleted = async (price: Stripe.Price): Promise<void> => {
  try {
    console.log(`Processing price.deleted: ${price.id}`);

    // Find the plan that uses this price
    const plan = await findPlanByStripePriceId(db, price.id);

    if (!plan) {
      console.warn(`Plan not found for price.deleted: ${price.id}`);
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
      const meteredItems = plan.meteredItems.filter((item) => item.priceId !== price.id);
      if (meteredItems.length !== plan.meteredItems.length) {
        updates.meteredItems = meteredItems;
      }
    }

    if (Object.keys(updates).length > 0) {
      await upsertPlan(db, {
        ...plan,
        ...updates,
      });

      console.log(`Successfully removed price from plan: ${price.id}`);
    } else {
      console.log(`No updates needed for price deletion: ${price.id}`);
    }
  } catch (error) {
    console.error(`Failed to process price.deleted: ${price.id}`, error);
    throw error;
  }
};

