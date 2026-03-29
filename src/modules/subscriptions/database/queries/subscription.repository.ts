/**
 * Subscription Repository
 *
 * Data access layer for subscription-related entities:
 * - Subscription Plans (normalized product metadata)
 * - Subscription Prices (individual Stripe prices)
 * - Subscription Line Items (user subscription line items)
 * - Subscription Events (audit trail)
 */

import { eq, and, desc } from 'drizzle-orm';
import type {
  NewSubscriptionEvent,
  SubscriptionEvent,
} from '@/modules/subscriptions/database/schema/subscriptionEvents.schema';
import type {
  NewSubscriptionLineItem,
  SubscriptionLineItem,
} from '@/modules/subscriptions/database/schema/subscriptionLineItems.schema';
import type {
  NewSubscriptionPrice,
  SubscriptionPrice,
} from '@/modules/subscriptions/database/schema/subscriptionPrices.schema';
import type {
  NewSubscriptionPlan,
  SubscriptionPlan,
} from '@/modules/subscriptions/database/schema/subscriptionPlans.schema';
import {
  subscriptionEvents,
  subscriptionLineItems,
  subscriptionPrices,
  subscriptionPlans,
} from '@/modules/subscriptions/database/schema';
import type { db } from '@/shared/database';

type DbOrTx = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * --- Subscription Plans Operations ---
 */

const findPlanById = async (db: DbOrTx, planId: string): Promise<SubscriptionPlan | undefined> => {
  const [plan] = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.id, planId)).limit(1);
  return plan;
};

const findPlanByName = async (db: DbOrTx, name: string): Promise<SubscriptionPlan | undefined> => {
  const [plan] = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.name, name)).limit(1);
  return plan;
};

const findPlanByStripeProductId = async (
  db: DbOrTx,
  stripeProductId: string
): Promise<SubscriptionPlan | undefined> => {
  const [plan] = await db
    .select()
    .from(subscriptionPlans)
    .where(eq(subscriptionPlans.stripe_product_id, stripeProductId))
    .limit(1);
  return plan;
};

const findAllActivePlans = async (db: DbOrTx): Promise<SubscriptionPlan[]> =>
  await db
    .select()
    .from(subscriptionPlans)
    .where(eq(subscriptionPlans.is_active, true))
    .orderBy(subscriptionPlans.sort_order);

const upsertPlan = async (db: DbOrTx, planData: NewSubscriptionPlan): Promise<SubscriptionPlan> => {
  const existingPlan = await findPlanByStripeProductId(db, planData.stripe_product_id);

  if (existingPlan) {
    const [updated] = await db
      .update(subscriptionPlans)
      .set({ ...planData, updated_at: new Date() })
      .where(eq(subscriptionPlans.id, existingPlan.id))
      .returning();
    return updated;
  }

  const [created] = await db.insert(subscriptionPlans).values(planData).returning();
  return created;
};

const deactivatePlan = async (db: DbOrTx, stripeProductId: string): Promise<SubscriptionPlan | undefined> => {
  const [updated] = await db
    .update(subscriptionPlans)
    .set({ is_active: false, updated_at: new Date() })
    .where(eq(subscriptionPlans.stripe_product_id, stripeProductId))
    .returning();
  return updated;
};

/**
 * --- Subscription Prices Operations ---
 */

const findPriceById = async (db: DbOrTx, priceId: string): Promise<SubscriptionPrice | undefined> => {
  const [price] = await db.select().from(subscriptionPrices).where(eq(subscriptionPrices.id, priceId)).limit(1);
  return price;
};

const findPriceByStripeId = async (db: DbOrTx, stripePriceId: string): Promise<SubscriptionPrice | undefined> => {
  const [price] = await db
    .select()
    .from(subscriptionPrices)
    .where(eq(subscriptionPrices.stripe_price_id, stripePriceId))
    .limit(1);
  return price;
};

const findPricesByPlanId = async (db: DbOrTx, planId: string): Promise<SubscriptionPrice[]> =>
  await db.select().from(subscriptionPrices).where(eq(subscriptionPrices.plan_id, planId));

const findPricesByProductId = async (db: DbOrTx, stripeProductId: string): Promise<SubscriptionPrice[]> =>
  await db.select().from(subscriptionPrices).where(eq(subscriptionPrices.stripe_product_id, stripeProductId));

const upsertPrice = async (db: DbOrTx, priceData: NewSubscriptionPrice): Promise<SubscriptionPrice> => {
  const existing = await findPriceByStripeId(db, priceData.stripe_price_id);

  if (existing) {
    const [updated] = await db
      .update(subscriptionPrices)
      .set({ ...priceData, updated_at: new Date() })
      .where(eq(subscriptionPrices.id, existing.id))
      .returning();
    return updated;
  }

  const [created] = await db.insert(subscriptionPrices).values(priceData).returning();
  return created;
};

const deletePrice = async (db: DbOrTx, stripePriceId: string): Promise<void> => {
  await db.delete(subscriptionPrices).where(eq(subscriptionPrices.stripe_price_id, stripePriceId));
};

const deactivatePricesByProductId = async (db: DbOrTx, stripeProductId: string): Promise<void> => {
  await db
    .update(subscriptionPrices)
    .set({ is_active: false, updated_at: new Date() })
    .where(eq(subscriptionPrices.stripe_product_id, stripeProductId));
};

const countActivePricesForPlan = async (db: DbOrTx, planId: string): Promise<number> => {
  const rows = await db
    .select()
    .from(subscriptionPrices)
    .where(and(eq(subscriptionPrices.plan_id, planId), eq(subscriptionPrices.is_active, true)));
  return rows.length;
};

/**
 * --- Subscription Line Items Operations ---
 */

const findLineItemsBySubscriptionId = async (db: DbOrTx, subscriptionId: string): Promise<SubscriptionLineItem[]> =>
  await db.select().from(subscriptionLineItems).where(eq(subscriptionLineItems.subscription_id, subscriptionId));

const findLineItemByStripeItemId = async (
  db: DbOrTx,
  stripeSubscriptionItemId: string
): Promise<SubscriptionLineItem | undefined> => {
  const [item] = await db
    .select()
    .from(subscriptionLineItems)
    .where(eq(subscriptionLineItems.stripe_subscription_item_id, stripeSubscriptionItemId))
    .limit(1);
  return item;
};

const upsertLineItem = async (db: DbOrTx, itemData: NewSubscriptionLineItem): Promise<SubscriptionLineItem> => {
  const existingItem = await findLineItemByStripeItemId(db, itemData.stripe_subscription_item_id);

  if (existingItem) {
    const [updated] = await db
      .update(subscriptionLineItems)
      .set({ ...itemData, updated_at: new Date() })
      .where(eq(subscriptionLineItems.id, existingItem.id))
      .returning();
    return updated;
  }

  const [created] = await db.insert(subscriptionLineItems).values(itemData).returning();
  return created;
};

const deleteLineItem = async (db: DbOrTx, stripeSubscriptionItemId: string): Promise<void> => {
  await db
    .delete(subscriptionLineItems)
    .where(eq(subscriptionLineItems.stripe_subscription_item_id, stripeSubscriptionItemId));
};

const deleteLineItemsBySubscriptionId = async (db: DbOrTx, subscriptionId: string): Promise<void> => {
  await db.delete(subscriptionLineItems).where(eq(subscriptionLineItems.subscription_id, subscriptionId));
};

/**
 * --- Subscription Events Operations ---
 */

const createEvent = async (db: DbOrTx, eventData: NewSubscriptionEvent): Promise<SubscriptionEvent> => {
  const [created] = await db.insert(subscriptionEvents).values(eventData).returning();
  return created;
};

const findEventsBySubscriptionId = async (db: DbOrTx, subscriptionId: string): Promise<SubscriptionEvent[]> =>
  await db
    .select()
    .from(subscriptionEvents)
    .where(eq(subscriptionEvents.subscription_id, subscriptionId))
    .orderBy(desc(subscriptionEvents.created_at));

const findEventsBySubscriptionIdAndType = async (
  db: DbOrTx,
  subscriptionId: string,
  eventType: string
): Promise<SubscriptionEvent[]> =>
  await db
    .select()
    .from(subscriptionEvents)
    .where(
      and(eq(subscriptionEvents.subscription_id, subscriptionId), eq(subscriptionEvents.event_type, eventType as any))
    )
    .orderBy(desc(subscriptionEvents.created_at));

const findLatestEvent = async (db: DbOrTx, subscriptionId: string): Promise<SubscriptionEvent | undefined> => {
  const [event] = await db
    .select()
    .from(subscriptionEvents)
    .where(eq(subscriptionEvents.subscription_id, subscriptionId))
    .orderBy(desc(subscriptionEvents.created_at))
    .limit(1);
  return event;
};

export const subscriptionRepository = {
  // Plans
  findPlanById,
  findPlanByName,
  findPlanByStripeProductId,
  findAllActivePlans,
  upsertPlan,
  deactivatePlan,
  // Prices
  findPriceById,
  findPriceByStripeId,
  findPricesByPlanId,
  findPricesByProductId,
  upsertPrice,
  deletePrice,
  deactivatePricesByProductId,
  countActivePricesForPlan,
  // Line Items
  findLineItemsBySubscriptionId,
  findLineItemByStripeItemId,
  upsertLineItem,
  deleteLineItem,
  deleteLineItemsBySubscriptionId,
  // Events
  createEvent,
  findEventsBySubscriptionId,
  findEventsBySubscriptionIdAndType,
  findLatestEvent,
};

export default subscriptionRepository;
