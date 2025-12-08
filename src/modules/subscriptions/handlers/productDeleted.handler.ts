/**
 * Product Deleted Webhook Handler
 *
 * Handles Stripe product.deleted webhook events
 * Deactivates the subscription plan (soft delete)
 */

import type Stripe from 'stripe';

import { db } from '@/shared/database';
import { deactivatePlan } from '../database/queries/subscriptionPlans.repository';

/**
 * Handle product.deleted webhook event
 */
export const handleProductDeleted = async (product: Stripe.Product): Promise<void> => {
  try {
    console.log(`Processing product.deleted: ${product.id} - ${product.name}`);

    // Deactivate the plan instead of hard delete
    const deactivated = await deactivatePlan(db, product.id);

    if (deactivated) {
      console.log(`Successfully deactivated plan: ${product.id}`);
    } else {
      console.warn(`Plan not found for deactivation: ${product.id}`);
    }
  } catch (error) {
    console.error(`Failed to process product.deleted: ${product.id}`, error);
    throw error;
  }
};

