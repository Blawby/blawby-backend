/**
 * Subscription Line Items Repository
 *
 * Data access layer for subscription line items
 */

import { eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import * as schema from '@/schema';
import type { NewSubscriptionLineItem, SubscriptionLineItem } from '../schema/subscriptionLineItems.schema';

/**
 * Find all line items for a subscription
 */
export const findBySubscriptionId = async (
  db: NodePgDatabase<typeof schema>,
  subscriptionId: string,
): Promise<SubscriptionLineItem[]> => {
  return await db
    .select()
    .from(schema.subscriptionLineItems)
    .where(eq(schema.subscriptionLineItems.subscriptionId, subscriptionId));
};

/**
 * Find a line item by Stripe subscription item ID
 */
export const findByStripeSubscriptionItemId = async (
  db: NodePgDatabase<typeof schema>,
  stripeSubscriptionItemId: string,
): Promise<SubscriptionLineItem | undefined> => {
  const items = await db
    .select()
    .from(schema.subscriptionLineItems)
    .where(eq(schema.subscriptionLineItems.stripeSubscriptionItemId, stripeSubscriptionItemId))
    .limit(1);

  return items[0];
};

/**
 * Create or update a subscription line item
 */
export const upsertLineItem = async (
  db: NodePgDatabase<typeof schema>,
  itemData: NewSubscriptionLineItem,
): Promise<SubscriptionLineItem> => {
  // Try to find existing item
  const existingItem = await findByStripeSubscriptionItemId(db, itemData.stripeSubscriptionItemId);

  if (existingItem) {
    // Update existing item
    const updated = await db
      .update(schema.subscriptionLineItems)
      .set({
        ...itemData,
        updatedAt: new Date(),
      })
      .where(eq(schema.subscriptionLineItems.id, existingItem.id))
      .returning();

    return updated[0];
  }

  // Create new item
  const created = await db
    .insert(schema.subscriptionLineItems)
    .values(itemData)
    .returning();

  return created[0];
};

/**
 * Delete a subscription line item
 */
export const deleteLineItem = async (
  db: NodePgDatabase<typeof schema>,
  stripeSubscriptionItemId: string,
): Promise<void> => {
  await db
    .delete(schema.subscriptionLineItems)
    .where(eq(schema.subscriptionLineItems.stripeSubscriptionItemId, stripeSubscriptionItemId));
};

/**
 * Delete all line items for a subscription
 */
export const deleteBySubscriptionId = async (
  db: NodePgDatabase<typeof schema>,
  subscriptionId: string,
): Promise<void> => {
  await db
    .delete(schema.subscriptionLineItems)
    .where(eq(schema.subscriptionLineItems.subscriptionId, subscriptionId));
};

