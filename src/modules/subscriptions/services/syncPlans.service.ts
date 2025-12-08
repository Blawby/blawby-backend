/**
 * Sync Plans Service
 *
 * Syncs subscription plans from Stripe to database
 * Used for initial data load and manual sync
 */

import { getStripeInstance } from '@/shared/utils/stripe-client';
import { handleProductCreated } from '../handlers/productCreated.handler';

export interface SyncResult {
  synced: number;
  errors: Array<{ productId: string; error: string }>;
}

/**
 * Sync all subscription plans from Stripe to database
 */
export const syncAllPlansFromStripe = async (): Promise<SyncResult> => {
  const stripe = getStripeInstance();
  const result: SyncResult = {
    synced: 0,
    errors: [],
  };

  try {
    console.log('Starting sync of subscription plans from Stripe...');

    // Fetch all active products
    const products = await stripe.products.list({
      active: true,
      limit: 100,
    });

    console.log(`Found ${products.data.length} products to sync`);

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
          console.log(`Skipping product ${product.id} - no recurring prices`);
          continue;
        }

        // Use the product-created handler to sync
        await handleProductCreated(product);
        result.synced += 1;
        console.log(`Synced product: ${product.id} - ${product.name}`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        result.errors.push({
          productId: product.id,
          error: errorMessage,
        });
        console.error(`Failed to sync product ${product.id}:`, errorMessage);
      }
    }

    console.log(`Sync completed: ${result.synced} products synced, ${result.errors.length} errors`);
    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Failed to sync plans from Stripe:', errorMessage);
    throw error;
  }
};

