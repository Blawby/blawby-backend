/**
 * Subscription Repository
 *
 * Consolidated data access layer for all subscription-related entities:
 * - Subscription Plans
 * - Subscription Line Items
 * - Subscription Events
 */

import { eq, and, desc, or, isNotNull } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type {
  NewSubscriptionEvent,
  SubscriptionEvent,
  SubscriptionEventType,
} from '@/modules/subscriptions/database/schema/subscriptionEvents.schema';
import type { NewSubscriptionLineItem, SubscriptionLineItem } from '@/modules/subscriptions/database/schema/subscriptionLineItems.schema';
import type { NewSubscriptionPlan, SubscriptionPlan } from '@/modules/subscriptions/database/schema/subscriptionPlans.schema';
import * as schema from '@/schema';

/**
 * --- Subscription Events Operations ---
 */

/**
 * Create a new subscription event
 */
const createEvent = async (
  db: NodePgDatabase<typeof schema>,
  eventData: NewSubscriptionEvent,
): Promise<SubscriptionEvent> => {
  const created = await db
    .insert(schema.subscriptionEvents)
    .values(eventData)
    .returning();

  return created[0];
};

/**
 * Find all events for a subscription, ordered by most recent first
 */
const findEventsBySubscriptionId = async (
  db: NodePgDatabase<typeof schema>,
  subscriptionId: string,
): Promise<SubscriptionEvent[]> => {
  return await db
    .select()
    .from(schema.subscriptionEvents)
    .where(eq(schema.subscriptionEvents.subscription_id, subscriptionId))
    .orderBy(desc(schema.subscriptionEvents.created_at));
};

/**
 * Find events by type for a subscription
 */
const findEventsBySubscriptionIdAndType = async (
  db: NodePgDatabase<typeof schema>,
  subscriptionId: string,
  _eventType: SubscriptionEventType,
): Promise<SubscriptionEvent[]> => {
  return await db
    .select()
    .from(schema.subscriptionEvents)
    .where(
      and(
        eq(schema.subscriptionEvents.subscription_id, subscriptionId),
        eq(schema.subscriptionEvents.event_type, _eventType),
      ),
    )
    .orderBy(desc(schema.subscriptionEvents.created_at));
};

/**
 * Get the most recent event for a subscription
 */
const findLatestEvent = async (
  db: NodePgDatabase<typeof schema>,
  subscriptionId: string,
): Promise<SubscriptionEvent | undefined> => {
  const events = await db
    .select()
    .from(schema.subscriptionEvents)
    .where(eq(schema.subscriptionEvents.subscription_id, subscriptionId))
    .orderBy(desc(schema.subscriptionEvents.created_at))
    .limit(1);

  return events[0];
};

/**
 * --- Subscription Line Items Operations ---
 */

/**
 * Find all line items for a subscription
 */
const findLineItemsBySubscriptionId = async (
  db: NodePgDatabase<typeof schema>,
  subscriptionId: string,
): Promise<SubscriptionLineItem[]> => {
  return await db
    .select()
    .from(schema.subscriptionLineItems)
    .where(eq(schema.subscriptionLineItems.subscription_id, subscriptionId));
};

/**
 * Find a line item by Stripe subscription item ID
 */
const findLineItemByStripeItemId = async (
  db: NodePgDatabase<typeof schema>,
  stripeSubscriptionItemId: string,
): Promise<SubscriptionLineItem | undefined> => {
  const items = await db
    .select()
    .from(schema.subscriptionLineItems)
    .where(eq(schema.subscriptionLineItems.stripe_subscription_item_id, stripeSubscriptionItemId))
    .limit(1);

  return items[0];
};

/**
 * Create or update a subscription line item
 */
const upsertLineItem = async (
  db: NodePgDatabase<typeof schema>,
  itemData: NewSubscriptionLineItem,
): Promise<SubscriptionLineItem> => {
  // Try to find existing item
  const existingItem = await findLineItemByStripeItemId(db, itemData.stripe_subscription_item_id);

  if (existingItem) {
    // Update existing item
    const updated = await db
      .update(schema.subscriptionLineItems)
      .set({
        ...itemData,
        updated_at: new Date(),
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
const deleteLineItem = async (
  db: NodePgDatabase<typeof schema>,
  stripeSubscriptionItemId: string,
): Promise<void> => {
  await db
    .delete(schema.subscriptionLineItems)
    .where(eq(schema.subscriptionLineItems.stripe_subscription_item_id, stripeSubscriptionItemId));
};

/**
 * Delete all line items for a subscription
 */
const deleteLineItemsBySubscriptionId = async (
  db: NodePgDatabase<typeof schema>,
  subscriptionId: string,
): Promise<void> => {
  await db
    .delete(schema.subscriptionLineItems)
    .where(eq(schema.subscriptionLineItems.subscription_id, subscriptionId));
};

/**
 * --- Subscription Plans Operations ---
 */

/**
 * Find all active subscription plans sorted by sort order
 */
const findAllActivePlans = async (
  db: NodePgDatabase<typeof schema>,
): Promise<SubscriptionPlan[]> => {
  return await db
    .select()
    .from(schema.subscriptionPlans)
    .where(
      and(
        eq(schema.subscriptionPlans.is_active, true),
        or(
          isNotNull(schema.subscriptionPlans.stripe_monthly_price_id),
          isNotNull(schema.subscriptionPlans.stripe_yearly_price_id),
        ),
      ),
    )
    .orderBy(schema.subscriptionPlans.sort_order);
};

/**
 * Find a subscription plan by ID (UUID)
 */
const findPlanById = async (
  db: NodePgDatabase<typeof schema>,
  planId: string,
): Promise<SubscriptionPlan | undefined> => {
  const plans = await db
    .select()
    .from(schema.subscriptionPlans)
    .where(eq(schema.subscriptionPlans.id, planId))
    .limit(1);

  return plans[0];
};

/**
 * Find a subscription plan by name
 */
const findPlanByName = async (
  db: NodePgDatabase<typeof schema>,
  name: string,
): Promise<SubscriptionPlan | undefined> => {
  const plans = await db
    .select()
    .from(schema.subscriptionPlans)
    .where(eq(schema.subscriptionPlans.name, name))
    .limit(1);

  return plans[0];
};

/**
 * Find a subscription plan by Stripe product ID
 */
const findPlanByStripeProductId = async (
  db: NodePgDatabase<typeof schema>,
  stripeProductId: string,
): Promise<SubscriptionPlan | undefined> => {
  const plans = await db
    .select()
    .from(schema.subscriptionPlans)
    .where(eq(schema.subscriptionPlans.stripe_product_id, stripeProductId))
    .limit(1);

  return plans[0];
};

/**
 * Find a subscription plan by Stripe price ID (monthly or yearly)
 */
const findPlanByStripePriceId = async (
  db: NodePgDatabase<typeof schema>,
  stripePriceId: string,
): Promise<SubscriptionPlan | undefined> => {
  const plans = await db
    .select()
    .from(schema.subscriptionPlans)
    .where(
      and(
        eq(schema.subscriptionPlans.stripe_monthly_price_id, stripePriceId),
      ),
    )
    .limit(1);

  if (plans.length > 0) {
    return plans[0];
  }

  // Try yearly price
  const yearlyPlans = await db
    .select()
    .from(schema.subscriptionPlans)
    .where(
      and(
        eq(schema.subscriptionPlans.stripe_yearly_price_id, stripePriceId),
      ),
    )
    .limit(1);

  return yearlyPlans[0];
};

/**
 * Create or update a subscription plan
 */
const upsertPlan = async (
  db: NodePgDatabase<typeof schema>,
  planData: NewSubscriptionPlan,
): Promise<SubscriptionPlan> => {
  // Try to find existing plan by stripe product ID
  const existingPlan = await findPlanByStripeProductId(db, planData.stripe_product_id);

  if (existingPlan) {
    // Update existing plan
    const updated = await db
      .update(schema.subscriptionPlans)
      .set({
        ...planData,
        updated_at: new Date(),
      })
      .where(eq(schema.subscriptionPlans.id, existingPlan.id))
      .returning();

    return updated[0];
  }

  // Create new plan
  const created = await db
    .insert(schema.subscriptionPlans)
    .values(planData)
    .returning();

  return created[0];
};

/**
 * Deactivate a subscription plan (soft delete)
 */
const deactivatePlan = async (
  db: NodePgDatabase<typeof schema>,
  stripeProductId: string,
): Promise<SubscriptionPlan | undefined> => {
  const updated = await db
    .update(schema.subscriptionPlans)
    .set({
      is_active: false,
      updated_at: new Date(),
    })
    .where(eq(schema.subscriptionPlans.stripe_product_id, stripeProductId))
    .returning();

  return updated[0];
};

/**
 * Get all plans (including inactive) for admin purposes
 */
const findAllPlans = async (
  db: NodePgDatabase<typeof schema>,
): Promise<SubscriptionPlan[]> => {
  return await db
    .select()
    .from(schema.subscriptionPlans)
    .orderBy(desc(schema.subscriptionPlans.created_at));
};

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
