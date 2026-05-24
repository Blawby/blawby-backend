import type { Stripe } from 'stripe';
import { getLogger } from '@logtape/logtape';
import { db } from '@/shared/database';
import { subscriptionRepository } from '@/modules/subscriptions/database/queries/subscription.repository';
import { sanitizeError } from '@/shared/utils/logging';

const logger = getLogger(['subscriptions', 'handlers', 'product-deleted']);

export const handleProductDeleted = async (product: Stripe.Product | Stripe.DeletedProduct): Promise<void> => {
  try {
    logger.info('Processing product.deleted: {productId}', { productId: product.id });

    await subscriptionRepository.deactivatePricesByProductId(db, product.id);

    logger.info('Deactivated all prices for product: {productId}', { productId: product.id });
  } catch (error) {
    logger.error('Failed to process product.deleted: {productId}. Error: {error}', {
      productId: product.id,
      error: sanitizeError(error),
    });
    throw error;
  }
};
