import type { Stripe } from 'stripe';
import { getLogger } from '@logtape/logtape';
import { db } from '@/shared/database';
import { subscriptionRepository } from '@/modules/subscriptions/database/queries/subscription.repository';
import { getStripeInstance } from '@/shared/utils/stripe-client';
import { getInternalTypeFromMeterName } from '@/modules/subscriptions/constants/metered-products';
import { extractFeatures, extractLimits } from '@/modules/subscriptions/utils/product-helpers';

const logger = getLogger(['subscriptions', 'handlers', 'price-created']);

export const handlePriceCreated = async (price: Stripe.Price): Promise<void> => {
  try {
    const productId = typeof price.product === 'string' ? price.product : price.product.id;

    logger.info('Processing price.created: {priceId} for product {productId}', {
      priceId: price.id,
      productId,
    });

    let internalType: string | undefined = undefined;
    let meterName: string | null = null;

    if (price.recurring?.usage_type === 'metered' && price.recurring?.meter) {
      try {
        const stripe = getStripeInstance();
        const meter = await stripe.billing.meters.retrieve(price.recurring.meter);
        internalType = getInternalTypeFromMeterName(meter.event_name) ?? undefined;
        meterName = meter.event_name;
      } catch (err) {
        logger.error('Failed to retrieve meter for price {priceId}: {error}', {
          priceId: price.id,
          error: err instanceof Error ? err.message : 'Unknown error',
        });
        throw err;
      }
    }

    // For licensed prices, pull product display data from Stripe
    let displayData: Record<string, unknown> = {};
    if (price.recurring?.usage_type !== 'metered') {
      try {
        const stripe = getStripeInstance();
        const product = await stripe.products.retrieve(productId);
        const metadata = product.metadata || {};
        displayData = {
          name: metadata.plan_name || product.name.toLowerCase().replace(/\s+/g, '_'),
          display_name: product.name,
          description: product.description ?? null,
          features: extractFeatures(product),
          limits: extractLimits(metadata),
          is_public: metadata.is_public !== 'false',
          sort_order: parseInt(metadata.sort_order || '0', 10) || 0,
          image: product.images?.[0] ?? null,
        };
      } catch (err) {
        logger.error('Failed to fetch product display data for price {priceId}: {error}', {
          priceId: price.id,
          error: err instanceof Error ? err.message : 'Unknown error',
        });
        throw err;
      }
    }

    await subscriptionRepository.upsertPrice({
      stripe_price_id: price.id,
      stripe_product_id: productId,
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
      ...displayData,
    });

    logger.info('Successfully created price: {priceId}', { priceId: price.id });
  } catch (error) {
    logger.error('Failed to process price.created: {priceId}. Error: {error}', {
      priceId: price.id,
      error,
    });
    throw error;
  }
};
