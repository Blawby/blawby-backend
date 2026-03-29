/**
 * Price Created Webhook Handler
 *
 * Handles Stripe price.created webhook events
 * Creates a new price linked to a subscription plan
 */

import type { Stripe } from 'stripe';
import { getLogger } from '@logtape/logtape';
import { db } from '@/shared/database';
import { subscriptionRepository } from '@/modules/subscriptions/database/queries/subscription.repository';
import { getStripeInstance } from '@/shared/utils/stripe-client';
import { getInternalTypeFromMeterName } from '@/modules/subscriptions/constants/meteredProducts';

const logger = getLogger(['subscriptions', 'handlers', 'price-created']);

/**
 * Handle price.created webhook event
 */
export const handlePriceCreated = async (price: Stripe.Price): Promise<void> => {
  try {
    logger.info('Processing price.created: {priceId} for product {productId}', {
      priceId: price.id,
      productId: typeof price.product === 'string' ? price.product : price.product.id,
    });

    // Find the plan for this product
    const productId = typeof price.product === 'string' ? price.product : price.product.id;
    const plan = await subscriptionRepository.findPlanByStripeProductId(db, productId);

    if (!plan) {
      logger.warn('Plan not found for price.created: {priceId}, product: {productId}', {
        priceId: price.id,
        productId,
      });
      return;
    }

    let internal_type: string | undefined = undefined;

    // For metered prices, fetch meter and get internal type
    if (price.recurring?.usage_type === 'metered' && price.recurring?.meter) {
      try {
        const stripe = getStripeInstance();
        const meter = await stripe.billing.meters.retrieve(price.recurring.meter);
        internal_type = getInternalTypeFromMeterName(meter.event_name) ?? undefined;
      } catch (err) {
        logger.error('Failed to retrieve meter for price {priceId}: {error}', {
          priceId: price.id,
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }

    let meter_name: string | null = null;

    // Fetch meter_name if metered
    if (price.recurring?.usage_type === 'metered' && price.recurring?.meter) {
      try {
        const stripe = getStripeInstance();
        const meter = await stripe.billing.meters.retrieve(price.recurring.meter);
        meter_name = meter.event_name;
      } catch {
        // Already logged
      }
    }

    const priceData = {
      plan_id: plan.id,
      stripe_price_id: price.id,
      stripe_product_id: productId,
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
    logger.info('Successfully created price: {priceId}', { priceId: price.id });
  } catch (error) {
    logger.error('Failed to process price.created: {priceId}. Error: {error}', {
      priceId: price.id,
      error,
    });
    throw error;
  }
};
