/**
 * Product Deleted Webhook Handler
 *
 * Handles Stripe product.deleted webhook events
 * Deactivates the subscription plan (soft delete)
 */

import type { Stripe } from 'stripe';
import { getLogger } from '@logtape/logtape';

import { db } from '@/shared/database';
import { subscriptionRepository } from '@/modules/subscriptions/database/queries/subscription.repository';

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

    // Deactivate all prices for this product
    await subscriptionRepository.deactivatePricesByProductId(db, product.id);
    logger.info('Deactivated prices for product: {productId}', { productId: product.id });

    // Also deactivate the plan (soft) so product is not visible
    const deactivatedPlan = await subscriptionRepository.deactivatePlan(db, product.id);
    if (deactivatedPlan) {
      logger.info('Deactivated plan for product: {productId}', { productId: product.id });
    } else {
      logger.warn('No plan found to deactivate for product: {productId}', { productId: product.id });
    }
  } catch (error) {
    logger.error('Failed to process product.deleted: {productId}. Error: {error}', {
      productId: product.id,
      error,
    });
    throw error;
  }
};
