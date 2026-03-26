/**
 * Product Deleted Webhook Handler
 *
 * Handles Stripe product.deleted webhook events
 * Deactivates the subscription plan (soft delete)
 */

import type Stripe from 'stripe';
import { getLogger } from '@logtape/logtape';

import { db } from '@/shared/database';
import { subscriptionRepository } from '../database/queries/subscription.repository';

const logger = getLogger(['subscriptions', 'handlers', 'product-deleted']);

/**
 * Handle product.deleted webhook event
 */
export const handleProductDeleted = async (product: Stripe.Product | Stripe.DeletedProduct): Promise<void> => {
  try {
    logger.info('Processing product.deleted: {productId} - {productName}', {
      productId: product.id,
      productName: 'name' in product ? product.name : undefined,
    });

    // Deactivate the plan instead of hard delete
    const deactivated = await subscriptionRepository.deactivatePlan(db, product.id);

    if (deactivated) {
      logger.info('Successfully deactivated plan: {productId}', { productId: product.id });
    } else {
      logger.warn('Plan not found for deactivation: {productId}', { productId: product.id });
    }
  } catch (error) {
    logger.error('Failed to process product.deleted: {productId}. Error: {error}', {
      productId: product.id,
      error,
    });
    throw error;
  }
};
