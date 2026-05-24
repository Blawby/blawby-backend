import { getLogger } from '@logtape/logtape';
import type { Stripe } from 'stripe';
import { getInternalTypeFromMeterName } from '@/modules/subscriptions/constants/metered-products';
import { subscriptionRepository } from '@/modules/subscriptions/database/queries/subscription.repository';
import { db } from '@/shared/database';
import { getStripeInstance } from '@/shared/utils/stripe-client';
import { extractFeatures, extractLimits } from '@/modules/subscriptions/utils/product-helpers';

const logger = getLogger(['subscriptions', 'handlers', 'product-updated']);

export const handleProductUpdated = async (product: Stripe.Product): Promise<void> => {
  try {
    logger.info('Processing product.updated: {productId} - {productName}', {
      productId: product.id,
      productName: product.name,
    });

    const stripe = getStripeInstance();
    const allPrices = await stripe.prices.list({ product: product.id, active: true, limit: 100 }).autoPagingToArray({ limit: 10000 });

    const metadata = product.metadata || {};
    const displayData = {
      name: metadata.plan_name || product.name.toLowerCase().replace(/\s+/g, '_'),
      display_name: product.name,
      description: product.description ?? null,
      features: extractFeatures(product),
      limits: extractLimits(metadata),
      is_public: metadata.is_public !== 'false',
      sort_order: parseInt(metadata.sort_order || '0', 10),
      image: product.images?.[0] ?? null,
    };

    // Push display data to all licensed prices for this product
    await subscriptionRepository.upsertProductDisplayData(db, product.id, displayData);

    // Upsert individual prices (meter data, active status, etc.)
    const upsertPricePromises = allPrices.map(async (price) => {
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

      return subscriptionRepository.upsertPrice(db, {
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
        ...(price.recurring?.usage_type !== 'metered' ? displayData : {}),
      });
    });

    const upsertResults = await Promise.allSettled(upsertPricePromises);
    for (let i = 0; i < upsertResults.length; i++) {
      const result = upsertResults[i];
      if (result.status === 'rejected') {
        logger.error('Failed to upsert price {priceId}: {error}', {
          priceId: allPrices[i]?.id,
          error: result.reason,
        });
      }
    }

    // Deactivate DB prices not in current Stripe response
    try {
      const currentPriceIds = new Set(allPrices.map((p) => p.id));
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
      priceCount: allPrices.length,
    });
  } catch (error) {
    logger.error('Failed to process product.updated: {productId}. Error: {error}', {
      productId: product.id,
      error,
    });
    throw error;
  }
};
