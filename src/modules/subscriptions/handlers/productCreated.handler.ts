/**
 * Product Created Webhook Handler
 *
 * Handles Stripe product.created webhook events
 * Creates a new subscription plan in the database
 */

import type Stripe from 'stripe';

import { db } from '@/shared/database';
import { getStripeInstance } from '@/shared/utils/stripe-client';
import { upsertPlan, findPlanByName } from '../database/queries/subscriptionPlans.repository';

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
const extractFeatures = (metadata: Record<string, string>): string[] => {
  if (metadata.features) {
    try {
      return JSON.parse(metadata.features);
    } catch {
      // Fall through to comma-separated
    }
  }

  // Try comma-separated features
  if (metadata.features_list) {
    return metadata.features_list.split(',').map((f) => f.trim());
  }

  return [];
};

/**
 * Handle product.created webhook event
 */
export const handleProductCreated = async (product: Stripe.Product): Promise<void> => {
  try {
    console.log(`Processing product.created: ${product.id} - ${product.name}`);

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
    const features = extractFeatures(metadata);

    // Generate plan name - use metadata if provided, otherwise derive from product name
    let planName = metadata.plan_name || product.name.toLowerCase().replace(/\s+/g, '_');

    // Check if plan with this name already exists (but different product ID)
    const existingPlan = await findPlanByName(db, planName);
    if (existingPlan && existingPlan.stripeProductId !== product.id) {
      // Append product ID suffix to make it unique
      planName = `${planName}_${product.id.slice(-8)}`;
    }

    // Prepare plan data
    const planData = {
      name: planName,
      displayName: product.name,
      description: product.description || null,
      stripeProductId: product.id,
      stripeMonthlyPriceId: monthlyPrice?.id || null,
      stripeYearlyPriceId: yearlyPrice?.id || null,
      monthlyPrice: monthlyPrice?.unit_amount
        ? (monthlyPrice.unit_amount / 100).toString()
        : null,
      yearlyPrice: yearlyPrice?.unit_amount
        ? (yearlyPrice.unit_amount / 100).toString()
        : null,
      currency: monthlyPrice?.currency || yearlyPrice?.currency || 'usd',
      features,
      limits,
      meteredItems: [], // Will be handled by price.created events
      isActive: product.active,
      isPublic: metadata.is_public !== 'false',
      sortOrder: parseInt(metadata.sort_order || '0', 10),
      metadata,
    };

    // Upsert plan
    await upsertPlan(db, planData);

    console.log(`Successfully processed product.created: ${product.id}`);
  } catch (error) {
    console.error(`Failed to process product.created: ${product.id}`, error);
    throw error;
  }
};

