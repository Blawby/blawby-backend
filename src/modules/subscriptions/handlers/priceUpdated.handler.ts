/**
 * Price Updated Webhook Handler
 *
 * Handles Stripe price.updated webhook events
 * Updates the subscription plan with the modified price
 */

import type Stripe from 'stripe';

import { db } from '@/shared/database';
import { findPlanByStripePriceId, upsertPlan } from '../database/queries/subscriptionPlans.repository';

/**
 * Handle price.updated webhook event
 */
export const handlePriceUpdated = async (price: Stripe.Price): Promise<void> => {
  try {
    console.log(`Processing price.updated: ${price.id}`);

    // Find the plan that uses this price
    const plan = await findPlanByStripePriceId(db, price.id);

    if (!plan) {
      console.warn(`Plan not found for price.updated: ${price.id}`);
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
      await upsertPlan(db, {
        ...plan,
        ...updates,
      });

      console.log(`Successfully updated plan with modified price: ${price.id}`);
    } else {
      console.log(`No updates needed for price: ${price.id}`);
    }
  } catch (error) {
    console.error(`Failed to process price.updated: ${price.id}`, error);
    throw error;
  }
};

