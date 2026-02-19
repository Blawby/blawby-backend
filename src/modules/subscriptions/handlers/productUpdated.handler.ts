/**
 * Product Updated Webhook Handler
 *
 * Handles Stripe product.updated webhook events
 * Updates an existing subscription plan in the database
 */

import { getLogger } from '@logtape/logtape';
import type { Stripe } from 'stripe';
import { subscriptionRepository } from '@/modules/subscriptions/database/queries/subscription.repository';
import { db } from '@/shared/database';
import { getStripeInstance } from '@/shared/utils/stripe-client';

const logger = getLogger(['subscriptions', 'handlers', 'product-updated']);

/**
 * Extract plan limits from product metadata
 */
const extractLimits = (
  metadata: Record<string, string>,
): {
  users: number;
  invoices_per_month: number;
  storage_gb: number;
} => {
  // Try to parse limits from JSON metadata
  if (metadata.limits) {
    try {
      const parsed = JSON.parse(metadata.limits);
      return {
        users: parsed.users ?? -1,
        invoices_per_month: parsed.invoices_per_month ?? -1,
        storage_gb: parsed.storage_gb ?? 10,
      };
    } catch {
      // Fall through to individual fields
    }
  }

  // Extract from individual metadata fields
  const parseLimit = (value: string | undefined, defaultValue: number): number => {
    if (!value) return defaultValue;
    if (value.toLowerCase() === 'unlimited' || value === '-1') return -1;
    const parsed = parseInt(value, 10);
    return Number.isNaN(parsed) ? defaultValue : parsed;
  };

  return {
    users: parseLimit(metadata.users_limit, -1),
    invoices_per_month: parseLimit(metadata.invoices_limit, -1),
    storage_gb: parseLimit(metadata.storage_gb, 10),
  };
};

/**
 * Extract features from product metadata
 */
const extractFeatures = (product: Stripe.Product): string[] | [] => {
  // Priority 1: Stripe Marketing Features (Native)
  if (product.marketing_features && product.marketing_features.length > 0) {
    return product.marketing_features
      .map((f) => f.name)
      .filter((name): name is string => name !== undefined);
  }

  const metadata = product.metadata || {};

  // Priority 2: Metadata JSON
  if (metadata.features) {
    try {
      return JSON.parse(metadata.features);
    } catch {
      // Fall through to comma-separated
    }
  }

  // Priority 3: Metadata Comma-Separated
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

    // Fetch all prices for this product
    const stripe = getStripeInstance();
    const prices = await stripe.prices.list({
      product: product.id,
      active: true,
      limit: 100,
    });

    // Find monthly and yearly prices
    const monthlyPrice = prices.data.find(
      (price) => price.recurring?.interval === 'month',
    );
    const yearlyPrice = prices.data.find(
      (price) => price.recurring?.interval === 'year',
    );

    // Extract metadata
    const metadata = product.metadata || {};
    const limits = extractLimits(metadata);
    const features = extractFeatures(product);

    // Generate plan name - use metadata if provided, otherwise derive from product name
    let planName = metadata.plan_name || product.name.toLowerCase().replace(/\s+/g, '_');

    // Check if plan with this name already exists (but different product ID)
    const existingPlan = await subscriptionRepository.findPlanByName(db, planName);
    if (existingPlan && existingPlan.stripe_product_id !== product.id) {
      // Append product ID suffix to make it unique
      planName = `${planName}_${product.id.slice(-8)}`;
    }

    // Prepare plan data
    const planData = {
      name: planName,
      display_name: product.name,
      description: product.description || null,
      stripe_product_id: product.id,
      stripe_monthly_price_id: monthlyPrice?.id || null,
      stripe_yearly_price_id: yearlyPrice?.id || null,
      monthly_price: monthlyPrice?.unit_amount
        ? (monthlyPrice.unit_amount / 100).toString()
        : null,
      yearly_price: yearlyPrice?.unit_amount
        ? (yearlyPrice.unit_amount / 100).toString()
        : null,
      currency: monthlyPrice?.currency || yearlyPrice?.currency || 'usd',
      image: product.images?.[0] || null,
      features,
      limits,
      metered_items: existingPlan?.metered_items || [], // Preserve existing metered items
      is_active: product.active,
      is_public: metadata.is_public !== 'false',
      sort_order: parseInt(metadata.sort_order || '0', 10),
      metadata,
    };

    // Upsert plan (will update existing)
    await subscriptionRepository.upsertPlan(db, planData);

    logger.info('Successfully processed product.updated: {productId}', { productId: product.id });
  } catch (error) {
    logger.error('Failed to process product.updated: {productId}. Error: {error}', {
      productId: product.id,
      error,
    });
    throw error;
  }
};
