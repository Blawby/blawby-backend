/**
 * Fetch Subscription Plans from Database
 *
 * Fetches subscription plans from the database (synced via webhooks)
 * and maps them to Better Auth plan format
 */

import { subscriptionRepository } from '@/modules/subscriptions/database/queries/subscription.repository';
import { db } from '@/shared/database';

interface PlanWithPrice {
  name: string;
  stripe_monthly_price_id: string | null;
  stripe_yearly_price_id: string | null;
  limits: {
    users: number;
    invoices_per_month: number;
    storage_gb: number;
    [key: string]: any;
  };
}

/**
 * Fetch subscription plans from database
 *
 * Returns active plans sorted by sort_order
 */
export const fetchStripePlans = async (): Promise<
  Array<{
    name: string;
    priceId: string;
    annualDiscountPriceId?: string;
    limits: {
      users: number;
      invoices_per_month: number;
      storage_gb: number;
    };
  }>
> => {
  try {
    // Fetch all active plans from database
    const plans = (await subscriptionRepository.findAllActivePlans(db)) as PlanWithPrice[];

    // Map to Better Auth format
    return plans
      .filter((plan: PlanWithPrice) => plan.stripe_monthly_price_id) // Only include plans with monthly price
      .map((plan: PlanWithPrice) => ({
        name: plan.name,
        priceId: plan.stripe_monthly_price_id!,
        annualDiscountPriceId: plan.stripe_yearly_price_id || undefined,
        limits: {
          users: plan.limits.users,
          invoices_per_month: plan.limits.invoices_per_month,
          storage_gb: plan.limits.storage_gb,
        },
      }));
  } catch (error) {
    console.error('Failed to fetch subscription plans from database:', error);

    // Return empty array if database fetch fails
    // Better Auth will handle empty plans gracefully
    return [];
  }
};
