/**
 * Fetch Subscription Plans from Database
 *
 * Fetches subscription plans from the database (synced via webhooks)
 * and maps them to Better Auth plan format
 */

import { db } from '@/shared/database';
import { subscriptionRepository } from '@/modules/subscriptions/database/queries/subscription.repository';

interface PlanWithPrice {
  name: string;
  stripeMonthlyPriceId: string | null;
  stripeYearlyPriceId: string | null;
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
export const fetchStripePlans = async (): Promise<Array<{
  name: string;
  priceId: string;
  annualDiscountPriceId?: string;
  limits: {
    users: number;
    invoices_per_month: number;
    storage_gb: number;
  };
}>> => {
  try {
    // Fetch all active plans from database
    const plans = await subscriptionRepository.findAllActivePlans(db) as PlanWithPrice[];

    // Map to Better Auth format
    return plans
      .filter((plan: PlanWithPrice) => plan.stripeMonthlyPriceId) // Only include plans with monthly price
      .map((plan: PlanWithPrice) => ({
        name: plan.name,
        priceId: plan.stripeMonthlyPriceId!,
        annualDiscountPriceId: plan.stripeYearlyPriceId || undefined,
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

