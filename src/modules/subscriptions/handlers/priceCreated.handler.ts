/**
 * Price Created Webhook Handler
 *
 * Handles Stripe price.created webhook events
 * Updates the subscription plan with the new price
 */

import type Stripe from 'stripe';

import { db } from '@/shared/database';
import { findPlanByStripeProductId, upsertPlan } from '../database/queries/subscriptionPlans.repository';

/**
 * Handle price.created webhook event
 */
export const handlePriceCreated = async (price: Stripe.Price): Promise<void> => {
  try {
    console.log(`Processing price.created: ${price.id} for product ${price.product}`);

    // Find the plan for this product
    const productId = typeof price.product === 'string' ? price.product : price.product.id;
    const plan = await findPlanByStripeProductId(db, productId);

    if (!plan) {
      console.warn(`Plan not found for price.created: ${price.id}, product: ${productId}`);
      return;
    }

    // Determine if this is a monthly or yearly price
    const interval = price.recurring?.interval;

    // Update the plan with the new price
    const updates: Record<string, unknown> = {};

    if (interval === 'month' && !plan.stripeMonthlyPriceId) {
      updates.stripeMonthlyPriceId = price.id;
      updates.monthlyPrice = price.unit_amount ? (price.unit_amount / 100).toString() : null;
    } else if (interval === 'year' && !plan.stripeYearlyPriceId) {
      updates.stripeYearlyPriceId = price.id;
      updates.yearlyPrice = price.unit_amount ? (price.unit_amount / 100).toString() : null;
    } else if (price.recurring && price.recurring.usage_type === 'metered') {
      // Handle metered price - add to meteredItems array
      const meteredItems = plan.meteredItems || [];
      meteredItems.push({
        priceId: price.id,
        meterName: price.nickname || 'metered',
        type: price.metadata?.meter_type || 'usage',
      });
      updates.meteredItems = meteredItems;
    }

    if (Object.keys(updates).length > 0) {
      await upsertPlan(db, {
        ...plan,
        ...updates,
      });

      console.log(`Successfully updated plan with new price: ${price.id}`);
    } else {
      console.log(`No updates needed for price: ${price.id}`);
    }
  } catch (error) {
    console.error(`Failed to process price.created: ${price.id}`, error);
    throw error;
  }
};

