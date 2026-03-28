/**
 * Subscription Repository
 *
 * Consolidated data access layer for all subscription-related entities:
 * - Subscription Plans
 * - Subscription Line Items
 * - Subscription Events
 */

import { eq, and, desc, or, isNotNull } from 'drizzle-orm';
import type {
  NewSubscriptionEvent,
  SubscriptionEvent,
  SubscriptionEventType,
} from '@/modules/subscriptions/database/schema/subscriptionEvents.schema';
import type {
  NewSubscriptionLineItem,
  SubscriptionLineItem,
} from '@/modules/subscriptions/database/schema/subscriptionLineItems.schema';
import type {
  NewSubscriptionPlan,
  SubscriptionPlan,
} from '@/modules/subscriptions/database/schema/subscriptionPlans.schema';
import { subscriptionEvents, subscriptionLineItems, subscriptionPlans } from '@/schema';
import { db } from '@/shared/database';

type DbOrTx = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * --- Subscription Events Operations ---
 */

/**
 * Create a new subscription event
 */
const createEvent = async (db: DbOrTx, eventData: NewSubscriptionEvent): Promise<SubscriptionEvent> => {
  const [created] = await db.insert(subscriptionEvents).values(eventData).returning();

  return created;
};

/**
 * Find all events for a subscription, ordered by most recent first
 */
const findEventsBySubscriptionId = async (db: DbOrTx, subscriptionId: string): Promise<SubscriptionEvent[]> =>
  await db
    .select()
    .from(subscriptionEvents)
    .where(eq(subscriptionEvents.subscription_id, subscriptionId))
    .orderBy(desc(subscriptionEvents.created_at));

/**
 * Find events by type for a subscription
 */
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

/**
 * Get the most recent event for a subscription
 */
const findLatestEvent = async (db: DbOrTx, subscriptionId: string): Promise<SubscriptionEvent | undefined> => {
  const [event] = await db
    .select()
    .from(subscriptionEvents)
    .where(eq(subscriptionEvents.subscription_id, subscriptionId))
    .orderBy(desc(subscriptionEvents.created_at))
    .limit(1);

  return event;
};

/**
 * --- Subscription Line Items Operations ---
 */

/**
 * Find all line items for a subscription
 */
const findLineItemsBySubscriptionId = async (db: DbOrTx, subscriptionId: string): Promise<SubscriptionLineItem[]> =>
  await db.select().from(subscriptionLineItems).where(eq(subscriptionLineItems.subscription_id, subscriptionId));

/**
 * Find a line item by Stripe subscription item ID
 */
const findLineItemByStripeItemId = async (
  db: DbOrTx,
  stripeSubscriptionItemId: string
): Promise<SubscriptionLineItem | undefined> => {
  const [items] = await db
    .select()
    .from(subscriptionLineItems)
    .where(eq(subscriptionLineItems.stripe_subscription_item_id, stripeSubscriptionItemId))
    .limit(1);

  return items;
};

/**
 * Create or update a subscription line item
 */
const upsertLineItem = async (db: DbOrTx, itemData: NewSubscriptionLineItem): Promise<SubscriptionLineItem> => {
  // Try to find existing item
  const existingItem = await findLineItemByStripeItemId(db, itemData.stripe_subscription_item_id);

  if (existingItem) {
    // Update existing item
    const [updated] = await db
      .update(subscriptionLineItems)
      .set({
        ...itemData,
        updated_at: new Date(),
      })
      .where(eq(subscriptionLineItems.id, existingItem.id))
      .returning();

    return updated;
  }

  // Create new item
  const [created] = await db.insert(subscriptionLineItems).values(itemData).returning();

  return created;
};

/**
 * Delete a subscription line item
 */
const deleteLineItem = async (db: DbOrTx, stripeSubscriptionItemId: string): Promise<void> => {
  await db
    .delete(subscriptionLineItems)
    .where(eq(subscriptionLineItems.stripe_subscription_item_id, stripeSubscriptionItemId));
};

/**
 * Delete all line items for a subscription
 */
const deleteLineItemsBySubscriptionId = async (db: DbOrTx, subscriptionId: string): Promise<void> => {
  await db.delete(subscriptionLineItems).where(eq(subscriptionLineItems.subscription_id, subscriptionId));
};

/**
 * --- Subscription Plans Operations ---
 */

/**
 * Find all active subscription plans sorted by sort order
 */
const findAllActivePlans = async (db: DbOrTx): Promise<SubscriptionPlan[]> =>
  await db
    .select()
    .from(subscriptionPlans)
    .where(
      and(
        eq(subscriptionPlans.is_active, true),
        or(isNotNull(subscriptionPlans.stripe_monthly_price_id), isNotNull(subscriptionPlans.stripe_yearly_price_id))
      )
    )
    .orderBy(subscriptionPlans.sort_order);

/**
 * Find a subscription plan by ID (UUID)
 */
const findPlanById = async (db: DbOrTx, planId: string): Promise<SubscriptionPlan | undefined> => {
  const [plan] = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.id, planId)).limit(1);

  return plan;
};

/**
 * Find a subscription plan by name
 */
const findPlanByName = async (db: DbOrTx, name: string): Promise<SubscriptionPlan | undefined> => {
  const [plan] = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.name, name)).limit(1);

  return plan;
};

/**
 * Find a subscription plan by Stripe product ID
 */
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

/**
 * Find a subscription plan by Stripe price ID (monthly or yearly)
 */
const findPlanByStripePriceId = async (db: DbOrTx, stripePriceId: string): Promise<SubscriptionPlan | undefined> => {
  const [monthlyPlan] = await db
    .select()
    .from(subscriptionPlans)
    .where(eq(subscriptionPlans.stripe_monthly_price_id, stripePriceId))
    .limit(1);

  if (monthlyPlan) {
    return monthlyPlan;
  }

  // Try yearly price
  const [yearlyPlan] = await db
    .select()
    .from(subscriptionPlans)
    .where(eq(subscriptionPlans.stripe_yearly_price_id, stripePriceId))
    .limit(1);

  return yearlyPlan;
};

/**
 * Create or update a subscription plan
 */
const upsertPlan = async (db: DbOrTx, planData: NewSubscriptionPlan): Promise<SubscriptionPlan> => {
  // Try to find existing plan by stripe product ID
  const existingPlan = await findPlanByStripeProductId(db, planData.stripe_product_id);

  if (existingPlan) {
    // Update existing plan
    const [updated] = await db
      .update(subscriptionPlans)
      .set({
        ...planData,
        updated_at: new Date(),
      })
      .where(eq(subscriptionPlans.id, existingPlan.id))
      .returning();

    return updated;
  }

  // Create new plan
  const [created] = await db.insert(subscriptionPlans).values(planData).returning();

  return created;
};

/**
 * Deactivate a subscription plan (soft delete)
 */
const deactivatePlan = async (db: DbOrTx, stripeProductId: string): Promise<SubscriptionPlan | undefined> => {
  const [updated] = await db
    .update(subscriptionPlans)
    .set({
      is_active: false,
      updated_at: new Date(),
    })
    .where(eq(subscriptionPlans.stripe_product_id, stripeProductId))
    .returning();

  return updated;
};

/**
 * Get all plans (including inactive) for admin purposes
 */
const findAllPlans = async (db: DbOrTx): Promise<SubscriptionPlan[]> =>
  await db.select().from(subscriptionPlans).orderBy(desc(subscriptionPlans.created_at));

export const subscriptionRepository = {
  // Events
  createEvent,
  findEventsBySubscriptionId,
  findEventsBySubscriptionIdAndType,
  findLatestEvent,
  // Line Items
  findLineItemsBySubscriptionId,
  findLineItemByStripeItemId,
  upsertLineItem,
  deleteLineItem,
  deleteLineItemsBySubscriptionId,
  // Plans
  findAllActivePlans,
  findPlanById,
  findPlanByName,
  findPlanByStripeProductId,
  findPlanByStripePriceId,
  upsertPlan,
  deactivatePlan,
  findAllPlans,
};

export default subscriptionRepository;
