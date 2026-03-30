/**
 * Product Updated Webhook Handler
 *
 * Handles Stripe product.updated webhook events
 * Updates the subscription plan in the database
 */

import { getLogger } from '@logtape/logtape';
import type { Stripe } from 'stripe';
import { getInternalTypeFromMeterName } from '@/modules/subscriptions/constants/meteredProducts';
import { subscriptionRepository } from '@/modules/subscriptions/database/queries/subscription.repository';
import { db } from '@/shared/database';
import { getStripeInstance } from '@/shared/utils/stripe-client';
import { extractFeatures, extractLimits } from '@/modules/subscriptions/utils/productHelpers';

const logger = getLogger(['subscriptions', 'handlers', 'product-updated']);

// Helper functions: extracted to '@/modules/subscriptions/utils/productHelpers'

/**
 * Handle product.updated webhook event
 */
export const handleProductUpdated = async (product: Stripe.Product): Promise<void> => {
  try {
    logger.info('Processing product.updated: {productId} - {productName}', {
      productId: product.id,
      productName: product.name,
    });

    // Fetch existing plan (if any) — if missing, we'll upsert from payload
    const existingPlan = await subscriptionRepository.findPlanByStripeProductId(db, product.id);
    if (!existingPlan) {
      logger.warn('Plan not found for product.updated: {productId}, will upsert from Stripe payload', {
        productId: product.id,
      });
    }

    // Fetch all prices for this product
    const stripe = getStripeInstance();
    const prices = await stripe.prices.list({
      product: product.id,
      active: true,
      limit: 100,
    });

    // Extract metadata and derived fields
    const metadata = product.metadata || {};
    const limits = extractLimits(metadata);
    const features = extractFeatures(product);

    // Update the plan
    const planData = {
      name: metadata.plan_name || product.name.toLowerCase().replace(/\s+/g, '_'),
      display_name: product.name,
      description: product.description ?? null,
      stripe_product_id: product.id,
      features,
      limits,
      is_active: product.active,
      is_public: metadata.is_public !== 'false',
      sort_order: parseInt(metadata.sort_order || '0', 10),
      metadata,
      image: product.images?.[0] || null,
    };

    const plan = await subscriptionRepository.upsertPlan(db, planData);

    // Upsert each price in parallel to avoid awaiting inside a loop
    const upsertPricePromises = prices.data.map(async (price) => {
      let internalType: string | undefined = undefined;
      let meterName: string | null = null;

      if (price.recurring?.usage_type === 'metered' && price.recurring?.meter) {
        try {
          const meter = await stripe.billing.meters.retrieve(price.recurring.meter);
          internalType = getInternalTypeFromMeterName(meter.event_name) ?? undefined;
          meterName = meter.event_name;
        } catch (err) {
          logger.error('Failed to retrieve meter for price {priceId}: {error}', {
            priceId: price.id,
            error: err instanceof Error ? err.message : 'Unknown error',
          });
        }
      }

      const priceData = {
        plan_id: plan.id,
        stripe_price_id: price.id,
        stripe_product_id: product.id,
        currency: price.currency,
        unit_amount: price.unit_amount ?? 0,
        interval: price.recurring?.interval ?? null,
        interval_count: price.recurring?.interval_count ?? null,
        usage_type: price.recurring?.usage_type ?? null,
        billing_scheme: price.billing_scheme ?? null,
        meter_id: price.recurring?.meter ?? null,
        meter_name: meterName,
        internal_type: internalType,
        is_active: price.active,
        metadata: price.metadata ?? {},
      };

      return subscriptionRepository.upsertPrice(db, priceData);
    });

    await Promise.allSettled(upsertPricePromises);

    // Reconcile: deactivate any DB prices for this product that are not present in Stripe
    try {
      const currentPriceIds = new Set(prices.data.map((p) => p.id));
      const dbPrices = await subscriptionRepository.findPricesByProductId(db, product.id);
      const deactivatePromises: Promise<unknown>[] = [];
      for (const dbPrice of dbPrices) {
        if (!currentPriceIds.has(dbPrice.stripe_price_id) && dbPrice.is_active) {
          deactivatePromises.push(subscriptionRepository.upsertPrice(db, { ...dbPrice, is_active: false }));
        }
      }

      await Promise.allSettled(deactivatePromises);
    } catch (err) {
      logger.error('Failed to reconcile prices for product {productId}: {error}', {
        productId: product.id,
        error: err,
      });
    }

    logger.info('Successfully processed product.updated: {productId} with {priceCount} prices', {
      productId: product.id,
      priceCount: prices.data.length,
    });
  } catch (error) {
    logger.error('Failed to process product.updated: {productId}. Error: {error}', {
      productId: product.id,
      error,
    });
    throw error;
  }
};
