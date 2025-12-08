/**
 * Metered Product Helpers
 *
 * Database-driven metered products configuration
 * Metered items are stored in subscription_plans.metered_items JSONB field
 */

import { eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import * as schema from '@/schema';

/**
 * Metered item from database
 */
export type MeteredItem = {
  priceId: string;
  meterName: string;
  type: string;
};

/**
 * Standard metered item types used across the platform
 */
export const METERED_TYPES = {
  INVOICE_FEE: 'metered_invoice_fee',
  USER_SEAT: 'metered_users',
  PAYMENT_FEE: 'metered_custom_payment_fee',
  PAYOUT_FEE: 'metered_payout_fee',
} as const;

/**
 * Get metered items for an organization's active subscription plan
 *
 * @param db - Database instance
 * @param organizationId - Organization UUID
 * @returns Array of metered items configured in the plan
 */
export const getMeteredItemsForOrganization = async (
  db: NodePgDatabase<typeof schema>,
  organizationId: string,
): Promise<MeteredItem[]> => {
  // 1. Get organization's active subscription
  const [org] = await db
    .select()
    .from(schema.organizations)
    .where(eq(schema.organizations.id, organizationId))
    .limit(1);

  if (!org?.activeSubscriptionId) {
    console.log(`No active subscription for organization: ${organizationId}`);
    return [];
  }

  // 2. Get subscription to find plan
  const [betterAuthSub] = await db
    .select()
    .from(schema.subscriptions)
    .where(eq(schema.subscriptions.id, org.activeSubscriptionId))
    .limit(1);

  if (!betterAuthSub?.plan) {
    console.log(`No plan found for subscription: ${org.activeSubscriptionId}`);
    return [];
  }

  // 3. Get plan's metered items configuration
  const [plan] = await db
    .select()
    .from(schema.subscriptionPlans)
    .where(eq(schema.subscriptionPlans.name, betterAuthSub.plan))
    .limit(1);

  if (!plan) {
    console.log(`Plan not found: ${betterAuthSub.plan}`);
    return [];
  }

  // 4. Return metered items from plan (default to empty array if not set)
  const meteredItems = (plan.meteredItems || []) as MeteredItem[];
  return meteredItems;
};

/**
 * Find a specific metered item by type
 *
 * @param meteredItems - Array of metered items from database
 * @param type - Metered item type (e.g., 'metered_invoice_fee')
 * @returns Metered item or undefined
 */
export const getMeteredItemByType = (
  meteredItems: MeteredItem[],
  type: string,
): MeteredItem | undefined => {
  return meteredItems.find((item) => item.type === type);
};

/**
 * Check if organization has any metered items configured
 *
 * @param db - Database instance
 * @param organizationId - Organization UUID
 * @returns True if organization has metered items
 */
export const hasMeteredItems = async (
  db: NodePgDatabase<typeof schema>,
  organizationId: string,
): Promise<boolean> => {
  const items = await getMeteredItemsForOrganization(db, organizationId);
  return items.length > 0;
};
