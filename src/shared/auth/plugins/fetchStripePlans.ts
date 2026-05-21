/**
 * Fetch Subscription Plans from Database
 *
 * Fetches subscription plans from the database (synced via webhooks)
 * and maps them to Better Auth plan format
 */

import { subscriptionRepository } from '@/modules/subscriptions/database/queries/subscription.repository';
import { db } from '@/shared/database';

/**
 * Fetch subscription plans from database
 *
 * Returns active plans with their prices sorted by sort_order
 * Prices are now normalized — fetches monthly/yearly from subscription_prices table
 */
export const fetchStripePlans = async (): Promise<
  {
    name: string;
    priceId: string;
    annualDiscountPriceId?: string;
    limits: {
      users: number;
      invoices_per_month: number;
      storage_gb: number;
    };
  }[]
> => {
  try {
    const logger = await import('@logtape/logtape').then((m) => m.getLogger(['auth', 'plugins', 'fetch-stripe-plans']));

    // Fetch all active plans from database
    const plans = await subscriptionRepository.findAllActivePlans(db);

    // Map to Better Auth format
    // For each plan, find its monthly and yearly prices from the normalized prices table
    const plansWithPrices = await Promise.all(
      plans.map(async (plan) => {
        const prices = await subscriptionRepository.findPricesByPlanId(db, plan.id);

        // Find monthly and yearly prices (licensed, not metered)
        const monthlyPrice = prices.find((p) => p.interval === 'month' && p.usage_type !== 'metered' && p.is_active);
        const yearlyPrice = prices.find((p) => p.interval === 'year' && p.usage_type !== 'metered' && p.is_active);

        // Only include plans that have at least a monthly price for Better Auth
        if (!monthlyPrice) {
          logger.warn('Plan {planId} has no active monthly price, skipping', { planId: plan.id });
          return null;
        }

        return {
          name: plan.name,
          priceId: monthlyPrice.stripe_price_id,
          annualDiscountPriceId: yearlyPrice?.stripe_price_id,
          limits: {
            users: plan.limits.users,
            invoices_per_month: plan.limits.invoices_per_month,
            storage_gb: plan.limits.storage_gb,
          },
        };
      })
    );

    // Filter out null entries (plans without prices)
    return plansWithPrices.filter((p) => p !== null) as {
      name: string;
      priceId: string;
      annualDiscountPriceId?: string;
      limits: {
        users: number;
        invoices_per_month: number;
        storage_gb: number;
      };
    }[];
  } catch (error) {
    const logger = await import('@logtape/logtape').then((m) => m.getLogger(['auth', 'plugins', 'fetch-stripe-plans']));
    logger.error('Failed to fetch subscription plans from database: {error}', { error });

    // Return empty array if database fetch fails
    // Better Auth will handle empty plans gracefully
    return [];
  }
};
