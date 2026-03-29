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

const logger = getLogger(['subscriptions', 'handlers', 'product-updated']);

/**
 * Parse limit value from metadata
 */
const parseLimit = (value: string | undefined, defaultValue: number): number => {
  if (!value) return defaultValue;
  if (value.toLowerCase() === 'unlimited' || value === '-1') return -1;
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? defaultValue : parsed;
};

/**
 * Extract plan limits from product metadata
 */
const extractLimits = (
  metadata: Record<string, string>
): {
  users: number;
  invoices_per_month: number;
  storage_gb: number;
} => {
  if (metadata.limits) {
    try {
      const parsed = JSON.parse(metadata.limits);
      return {
        users: parsed.users ?? -1,
        invoices_per_month: parsed.invoices_per_month ?? -1,
        storage_gb: parsed.storage_gb ?? 10,
      };
    } catch {
      // Fall through
    }
  }

  return {
    users: parseLimit(metadata.users_limit, -1),
    invoices_per_month: parseLimit(metadata.invoices_limit, -1),
    storage_gb: parseLimit(metadata.storage_gb, 10),
  };
};

/**
 * Extract features from product metadata
 */
const extractFeatures = (product: Stripe.Product): string[] => {
  if (product.marketing_features && product.marketing_features.length > 0) {
    return product.marketing_features.map((f) => f.name).filter((name): name is string => name !== undefined);
  }

  const metadata = product.metadata || {};

  if (metadata.features) {
    try {
      return JSON.parse(metadata.features);
    } catch {
      // Fall through
    }
  }

  if (metadata.features_list) {
    return metadata.features_list.split(',').map((f) => f.trim());
  }

  return [];
};

/**
 * Handle product.updated webhook event
 */
export const handleProductUpdated = async (product: Stripe.Product): Promise<void> => {
  try {
    logger.info('Processing product.updated: {productId} - {productName}', {
      productId: product.id,
      productName: product.name,
    });

    // Fetch existing plan
    const existingPlan = await subscriptionRepository.findPlanByStripeProductId(db, product.id);

    if (!existingPlan) {
      logger.warn('Plan not found for product.updated: {productId}', { productId: product.id });
      return;
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

    // Upsert each price
    for (const price of prices.data) {
      let internal_type: string | undefined = undefined;
      let meter_name: string | null = null;

      if (price.recurring?.usage_type === 'metered' && price.recurring?.meter) {
        try {
          const meter = await stripe.billing.meters.retrieve(price.recurring.meter);
          internal_type = getInternalTypeFromMeterName(meter.event_name) ?? undefined;
          meter_name = meter.event_name;
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
        meter_name,
        internal_type,
        is_active: true,
        metadata: price.metadata ?? {},
      };

      await subscriptionRepository.upsertPrice(db, priceData);
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
