import type Stripe from 'stripe';
import { getLogger } from '@logtape/logtape';
import { db } from '@/shared/database';
import { subscriptionRepository } from '@/modules/subscriptions/database/queries/subscription.repository';

const logger = getLogger(['subscriptions', 'handlers', 'price-deleted']);

export const handlePriceDeleted = async (price: Stripe.Price | Stripe.DeletedPrice): Promise<void> => {
  try {
    logger.info('Processing price.deleted: {priceId}', { priceId: price.id });

    const existing = await subscriptionRepository.findPriceByStripeId(db, price.id);
    if (!existing) {
      logger.warn('Price not found for price.deleted: {priceId}', { priceId: price.id });
      return;
    }

    await subscriptionRepository.deletePrice(db, price.id);

    logger.info('Successfully deleted price: {priceId}', { priceId: price.id });
  } catch (error) {
    logger.error('Failed to process price.deleted: {priceId}. Error: {error}', {
      priceId: price.id,
      error,
    });
    throw error;
  }
};
