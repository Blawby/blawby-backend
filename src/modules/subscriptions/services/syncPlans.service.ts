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

interface SyncResult {
  synced: number;
  errors: { product_id: string; error: string }[];
}

/**
 * Sync all subscription plans from Stripe to database
 * Uses the product.created handler to ensure consistent logic
 */
const syncAllPlansFromStripe = async (): Promise<Result<SyncResult>> => {
  const stripe = getStripeInstance();
  const result: SyncResult = {
    synced: 0,
    errors: [],
  };

  try {
    logger.info('Starting sync of subscription plans from Stripe...');

    let productCount = 0;
    await stripe.products.list({ active: true, limit: 100 }).autoPagingEach(async (product) => {
      productCount += 1;

      try {
        // Check if product has recurring prices (subscription product)
        let hasRecurring = false;
        await stripe.prices.list({ product: product.id, active: true, limit: 100 }).autoPagingEach((price) => {
          if (price.recurring) {
            hasRecurring = true;
          }
        });

        if (!hasRecurring) {
          logger.debug('Skipping product {productId} - no recurring prices', { productId: product.id });
          return;
        }

        // Use the product.created handler to ensure consistent sync logic
        await handleProductCreated(product);
        result.synced += 1;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        result.errors.push({ product_id: product.id, error: errorMessage });
        logger.error('Failed to sync product {productId}: {error}', {
          productId: product.id,
          error: errorMessage,
        });
      }
    });

    logger.info('Found {productCount} products, synced {synced} with {errorCount} errors', {
      productCount,
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
