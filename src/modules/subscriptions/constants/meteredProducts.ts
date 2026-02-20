/**
 * Metered Product Helpers
 *
 * Database-driven metered products configuration
 * Metered items are stored in subscription_plans.metered_items JSONB field
 */

import { getLogger } from '@logtape/logtape';
import { eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import * as schema from '@/schema';

const logger = getLogger(['subscriptions', 'constants', 'metered-products']);

/**
 * Metered item from database
 */
export type MeteredItem = {
  price_id: string;
  meter_name: string;
  type: string;
};

/**
 * Stripe Meter Event Names
 * These correspond to the event_name used in Stripe Billing Meters
 */
export enum StripeMeterNames {
  ACTIVE_USER_COUNT = 'active_user_count',
  INVOICE_FEE = 'invoice_fee',
  PAYOUT_FEE = 'payout_fee',
  PAYMENT_FEE = 'team_custom_payment'
}

/**
 * Standard metered item types used across the platform (Internal IDs)
 */
export const METERED_TYPES = {
  INVOICE_FEE: 'metered_invoice_fee',
  USER_SEAT: 'metered_users',
  PAYOUT_FEE: 'metered_payout_fee',
  INTAKE_FEE: 'metered_intake_fee',
} as const;

/**
 * Mapping between Internal Types and Stripe Meter Names
 */
export const METERED_TYPE_TO_STRIPE_EVENT: Record<string, StripeMeterNames> = {
  [METERED_TYPES.INVOICE_FEE]: StripeMeterNames.INVOICE_FEE,
  [METERED_TYPES.USER_SEAT]: StripeMeterNames.ACTIVE_USER_COUNT,
  [METERED_TYPES.PAYOUT_FEE]: StripeMeterNames.PAYOUT_FEE,
  [METERED_TYPES.INTAKE_FEE]: StripeMeterNames.PAYOUT_FEE,
};

/**
 * Get internal metered type from Stripe Meter Name
 */
export const getInternalTypeFromMeterName = (meterName: string): string | undefined => {
  const entry = Object.entries(METERED_TYPE_TO_STRIPE_EVENT).find(([, name]) => name === meterName);
  return entry ? entry[0] : undefined;
};

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
    logger.debug('No active subscription for organization: {organizationId}', { organizationId });
    return [];
  }

  // 2. Get subscription to find plan
  const [betterAuthSub] = await db
    .select()
    .from(schema.subscriptions)
    .where(eq(schema.subscriptions.id, org.activeSubscriptionId))
    .limit(1);

  if (!betterAuthSub?.plan) {
    logger.warn('No plan found for subscription: {subscriptionId}', { subscriptionId: org.activeSubscriptionId });
    return [];
  }

  // 3. Get plan's metered items configuration
  const [plan] = await db
    .select()
    .from(schema.subscriptionPlans)
    .where(eq(schema.subscriptionPlans.name, betterAuthSub.plan))
    .limit(1);

  if (!plan) {
    logger.warn('Plan not found: {planName}', { planName: betterAuthSub.plan });
    return [];
  }

  // 4. Return metered items from plan (default to empty array if not set)
  const meteredItems = (plan.metered_items || []) as MeteredItem[];
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
