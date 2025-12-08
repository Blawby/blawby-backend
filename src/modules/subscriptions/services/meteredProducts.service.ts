/**
 * Metered Products Service
 *
 * Handles lazy attachment of metered products to subscriptions
 * Metered products are only attached when features are first used
 *
 * This service uses a database-driven approach - metered items are configured
 * in the subscription_plans.metered_items JSONB field
 */

import { eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import * as schema from '@/schema';
import { getStripeInstance } from '@/shared/utils/stripe-client';
import {
  findBySubscriptionId as findLineItemsBySubscriptionId,
  upsertLineItem,
} from '@/modules/subscriptions/database/queries/subscriptionLineItems.repository';
import {
  getMeteredItemsForOrganization,
  getMeteredItemByType,
} from '../constants/meteredProducts';
import type { MeteredItem } from '../constants/meteredProducts';

/**
 * Ensure a metered product is attached to a subscription
 * This function is idempotent - safe to call multiple times
 *
 * @param db - Database instance
 * @param organizationId - Organization UUID
 * @param meteredItem - Metered item configuration from database
 * @returns Stripe subscription item ID
 */
export const ensureMeteredProduct = async (
  db: NodePgDatabase<typeof schema>,
  organizationId: string,
  meteredItem: MeteredItem,
): Promise<string> => {
  // 1. Get organization's active subscription
  const [org] = await db
    .select()
    .from(schema.organizations)
    .where(eq(schema.organizations.id, organizationId))
    .limit(1);

  if (!org?.activeSubscriptionId) {
    console.warn(`No active subscription for organization: ${organizationId}`);
    throw new Error('No active subscription found for this organization');
  }

  // 2. Check if metered product is already attached
  const lineItems = await findLineItemsBySubscriptionId(
    db,
    org.activeSubscriptionId,
  );

  const existingItem = lineItems.find(
    (item) => item.stripePriceId === meteredItem.priceId,
  );

  if (existingItem) {
    console.log(
      `Metered product already attached: ${meteredItem.meterName} (org: ${organizationId})`,
    );
    return existingItem.stripeSubscriptionItemId;
  }

  // 3. Get Stripe subscription ID from Better Auth subscriptions table
  const [betterAuthSub] = await db
    .select()
    .from(schema.subscriptions)
    .where(eq(schema.subscriptions.id, org.activeSubscriptionId))
    .limit(1);

  if (!betterAuthSub?.stripeSubscriptionId) {
    throw new Error('Stripe subscription ID not found');
  }

  // 4. Attach metered product to subscription via Stripe API
  const stripe = getStripeInstance();
  const subscriptionItem = await stripe.subscriptionItems.create({
    subscription: betterAuthSub.stripeSubscriptionId,
    price: meteredItem.priceId,
    metadata: {
      meter_name: meteredItem.meterName,
      item_type: meteredItem.type,
      organization_id: organizationId,
    },
  });

  // 5. Save subscription item to database
  await upsertLineItem(db, {
    subscriptionId: org.activeSubscriptionId,
    stripeSubscriptionItemId: subscriptionItem.id,
    stripePriceId: meteredItem.priceId,
    itemType: meteredItem.type as
      | 'metered_invoice_fee'
      | 'metered_users'
      | 'metered_custom_payment_fee'
      | 'metered_payout_fee',
    quantity: 0, // Metered items start at 0
    unitAmount: subscriptionItem.price.unit_amount
      ? (subscriptionItem.price.unit_amount / 100).toString()
      : null,
    description: meteredItem.meterName,
    metadata: {
      meter_name: meteredItem.meterName,
      auto_attached: 'true',
      attached_at: new Date().toISOString(),
    },
  });

  console.log(
    `✅ Attached metered product: ${meteredItem.meterName} to organization ${organizationId}`,
  );
  return subscriptionItem.id;
};

/**
 * Report metered usage for a subscription by type
 * Automatically attaches the metered product if not already attached
 *
 * This function is designed to be called asynchronously (fire-and-forget)
 * and will not throw errors to avoid disrupting the main feature flow
 *
 * @param db - Database instance
 * @param organizationId - Organization UUID
 * @param meteredType - Metered item type (e.g., 'metered_invoice_fee')
 * @param quantity - Usage quantity (default: 1)
 */
export const reportMeteredUsage = async (
  db: NodePgDatabase<typeof schema>,
  organizationId: string,
  meteredType: string,
  quantity: number = 1,
): Promise<void> => {
  try {
    // 1. Get organization's metered items from their subscription plan
    const meteredItems = await getMeteredItemsForOrganization(db, organizationId);

    if (meteredItems.length === 0) {
      console.log(
        `No metered items configured for organization: ${organizationId}`,
      );
      return;
    }

    // 2. Find the specific metered item by type
    const meteredItem = getMeteredItemByType(meteredItems, meteredType);

    if (!meteredItem) {
      console.log(
        `Metered item type "${meteredType}" not configured for organization: ${organizationId}`,
      );
      return;
    }

    // 3. Ensure metered product is attached (idempotent operation)
    const subscriptionItemId = await ensureMeteredProduct(
      db,
      organizationId,
      meteredItem,
    );

    // 4. Report usage to Stripe using the correct API
    const stripe = getStripeInstance();
    
    // Stripe API: Create usage record for the subscription item
    await stripe.subscriptionItems.createUsageRecord(subscriptionItemId, {
      quantity,
      action: 'increment',
      timestamp: Math.floor(Date.now() / 1000),
    });

    console.log(
      `📊 Usage reported: ${meteredItem.meterName} +${quantity} (org: ${organizationId})`,
    );
  } catch (error) {
    // Log error but don't throw - feature should work even if billing fails
    console.error(`Failed to report metered usage for ${meteredType}:`, error);
  }
};

/**
 * Get current usage summary for an organization
 *
 * @param db - Database instance
 * @param organizationId - Organization UUID
 * @returns Array of usage records with meter name and quantity
 */
export const getCurrentUsage = async (
  db: NodePgDatabase<typeof schema>,
  organizationId: string,
): Promise<
  Array<{ meterName: string; quantity: number; description: string | null }>
> => {
  // Get organization's subscription
  const [org] = await db
    .select()
    .from(schema.organizations)
    .where(eq(schema.organizations.id, organizationId))
    .limit(1);

  if (!org?.activeSubscriptionId) {
    return [];
  }

  // Get all metered line items
  const lineItems = await findLineItemsBySubscriptionId(
    db,
    org.activeSubscriptionId,
  );

  const meteredItems = lineItems.filter((item) =>
    item.itemType.startsWith('metered_'),
  );

  return meteredItems.map((item) => ({
    meterName:
      (item.metadata as Record<string, unknown>)?.meter_name ||
      item.description ||
      'unknown',
    quantity: item.quantity,
    description: item.description,
  }));
};
