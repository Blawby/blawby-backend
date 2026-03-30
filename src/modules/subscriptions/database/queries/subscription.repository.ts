/**
 * Subscription Repository
 *
 * Data access layer for subscription-related entities:
 * - Subscription Plans (normalized product metadata)
 * - Subscription Prices (individual Stripe prices)
 * - Subscription Line Items (user subscription line items)
 * - Subscription Events (audit trail)
 */

import { eq, and, desc, count, inArray } from 'drizzle-orm';
import type {
  NewSubscriptionEvent,
  SubscriptionEvent,
  SubscriptionEventType,
} from '@/modules/subscriptions/types/SubscriptionEvents';
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
  // Perform an atomic upsert based on stripe_product_id to avoid race conditions
  const [row] = await db
    .insert(subscriptionPlans)
    .values(planData)
    .onConflictDoUpdate({
      target: subscriptionPlans.stripe_product_id,
      set: { ...planData, updated_at: new Date() },
    })
    .returning();

  return row;
};

const deactivatePlan = async (db: DbOrTx, stripeProductId: string): Promise<SubscriptionPlan | undefined> => {
  const [updated] = await db
    .update(subscriptionPlans)
    .set({ is_active: false, updated_at: new Date() })
    .where(eq(subscriptionPlans.stripe_product_id, stripeProductId))
    .returning();
  return updated;
};

const activatePlan = async (db: DbOrTx, stripeProductId: string): Promise<SubscriptionPlan | undefined> => {
  const [updated] = await db
    .update(subscriptionPlans)
    .set({ is_active: true, updated_at: new Date() })
    .where(eq(subscriptionPlans.stripe_product_id, stripeProductId))
    .returning();
  return updated;
};

/**
 * --- Subscription Prices Operations ---
 */

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
  // Atomic upsert on stripe_price_id to avoid races
  const [row] = await db
    .insert(subscriptionPrices)
    .values(priceData)
    .onConflictDoUpdate({
      target: subscriptionPrices.stripe_price_id,
      set: { ...priceData, updated_at: new Date() },
    })
    .returning();

  return row;
};

const findPricesByPlanIds = async (db: DbOrTx, planIds: string[]): Promise<SubscriptionPrice[]> =>
  await db.select().from(subscriptionPrices).where(inArray(subscriptionPrices.plan_id, planIds));

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
  const [row] = await db
    .select({ count: count() })
    .from(subscriptionPrices)
    .where(and(eq(subscriptionPrices.plan_id, planId), eq(subscriptionPrices.is_active, true)));

  return Number(row?.count ?? 0);
};

/**
 * --- Subscription Line Items Operations ---
 */

const upsertLineItem = async (db: DbOrTx, itemData: NewSubscriptionLineItem): Promise<SubscriptionLineItem> => {
  const [existing] = await db
    .select()
    .from(subscriptionLineItems)
    .where(eq(subscriptionLineItems.stripe_subscription_item_id, itemData.stripe_subscription_item_id))
    .limit(1);

  if (existing) {
    const [updated] = await db
      .update(subscriptionLineItems)
      .set({ ...itemData, updated_at: new Date() })
      .where(eq(subscriptionLineItems.id, existing.id))
      .returning();
    return updated;
  }

  const [created] = await db.insert(subscriptionLineItems).values(itemData).returning();
  return created;
};

/**
 * --- Subscription Events Operations ---
 */

const createEvent = async (db: DbOrTx, eventData: NewSubscriptionEvent): Promise<SubscriptionEvent> => {
  const [created] = await db.insert(subscriptionEvents).values(eventData).returning();
  return created;
};

const findEventsBySubscriptionIdAndType = async (
  db: DbOrTx,
  subscriptionId: string,
  eventType: SubscriptionEventType
): Promise<SubscriptionEvent[]> =>
  await db
    .select()
    .from(subscriptionEvents)
    .where(and(eq(subscriptionEvents.subscription_id, subscriptionId), eq(subscriptionEvents.event_type, eventType)))
    .orderBy(desc(subscriptionEvents.created_at));

export const subscriptionRepository = {
  // Plans
  findPlanById,
  findPlanByName,
  findPlanByStripeProductId,
  findAllActivePlans,
  upsertPlan,
  deactivatePlan,
  activatePlan,
  // Prices
  findPriceByStripeId,
  findPricesByPlanId,
  findPricesByPlanIds,
  findPricesByProductId,
  upsertPrice,
  deletePrice,
  deactivatePricesByProductId,
  countActivePricesForPlan,
  // Line Items
  upsertLineItem,
  // Events
  createEvent,
  findEventsBySubscriptionIdAndType,
};

export default subscriptionRepository;
