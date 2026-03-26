/**
 * Sync Plans Service
 *
 * Syncs subscription plans from Stripe to database
 * Used for initial data load and manual sync
 */

import { getLogger } from '@logtape/logtape';
import { handleProductCreated } from '@/modules/subscriptions/handlers/productCreated.handler';
import type { Result } from '@/shared/types/result';
import { ok, internalError } from '@/shared/utils/result';
import { getStripeInstance } from '@/shared/utils/stripe-client';

const logger = getLogger(['subscriptions', 'services', 'sync-plans']);

export interface SyncResult {
  synced: number;
  errors: { product_id: string; error: string }[];
}

/**
 * Sync all subscription plans from Stripe to database
 */
const syncAllPlansFromStripe = async (): Promise<Result<SyncResult>> => {
  const stripe = getStripeInstance();
  const result: SyncResult = {
    synced: 0,
    errors: [],
  };

  try {
    logger.info('Starting sync of subscription plans from Stripe...');

    // Fetch all active products
    const products = await stripe.products.list({
      active: true,
      limit: 100,
    });

    logger.info('Found {productCount} products to sync', { productCount: products.data.length });

    // Process each product
    for (const product of products.data) {
      try {
        // Check if product has recurring prices (subscription product)
        const prices = await stripe.prices.list({
          product: product.id,
          active: true,
          limit: 10,
        });

        const hasRecurring = prices.data.some((price) => price.recurring !== null);
        if (!hasRecurring) {
          logger.debug('Skipping product {productId} - no recurring prices', { productId: product.id });
          continue;
        }

        // Use the product-created handler to sync
        await handleProductCreated(product);
        result.synced += 1;
        logger.info('Synced product: {productId} - {productName}', {
          productId: product.id,
          productName: product.name,
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        result.errors.push({
          product_id: product.id,
          error: errorMessage,
        });
        logger.error('Failed to sync product {productId}: {error}', {
          productId: product.id,
          error: errorMessage,
        });
      }
    }

    logger.info('Sync completed: {synced} products synced, {errorCount} errors', {
      synced: result.synced,
      errorCount: result.errors.length,
    });
    return ok(result);
  } catch (error) {
    logger.error('Failed to sync plans from Stripe: {error}', { error });
    return internalError('Failed to sync plans from Stripe');
  }
};

export const syncPlansService = {
  syncAllPlansFromStripe,
};

export default syncPlansService;
