import { eq, and, desc, asc } from 'drizzle-orm';
import type {
  NewSubscriptionEvent,
  SubscriptionEvent,
  SubscriptionEventType,
} from '@/modules/subscriptions/types/subscription-events.types';
import type {
  NewSubscriptionLineItem,
  SubscriptionLineItem,
} from '@/modules/subscriptions/database/schema/subscription-line-items.schema';
import type { NewStripePrice, StripePrice } from '@/modules/subscriptions/database/schema/stripe-prices.schema';
import { subscriptionEvents, subscriptionLineItems, stripePrices } from '@/modules/subscriptions/database/schema';
import { getActiveTx } from '@/shared/database/uow';

/**
 * --- Stripe Prices Operations ---
 */

const findPriceByStripeId = async (stripePriceId: string): Promise<StripePrice | undefined> => {
  const [price] = await getActiveTx()
    .select()
    .from(stripePrices)
    .where(eq(stripePrices.stripe_price_id, stripePriceId))
    .limit(1);
  return price;
};

const findPriceByName = async (name: string): Promise<StripePrice | undefined> => {
  const [price] = await getActiveTx()
    .select()
    .from(stripePrices)
    .where(and(eq(stripePrices.name, name), eq(stripePrices.is_active, true)))
    .orderBy(desc(stripePrices.created_at))
    .limit(1);
  return price;
};

const findPriceByNameAndInterval = async (
  name: string,
  interval: 'month' | 'year'
): Promise<StripePrice | undefined> => {
  const [price] = await getActiveTx()
    .select()
    .from(stripePrices)
    .where(and(eq(stripePrices.name, name), eq(stripePrices.interval, interval), eq(stripePrices.is_active, true)))
    .orderBy(desc(stripePrices.created_at))
    .limit(1);
  return price;
};

const findPricesByProductId = async (stripeProductId: string): Promise<StripePrice[]> =>
  await getActiveTx().select().from(stripePrices).where(eq(stripePrices.stripe_product_id, stripeProductId));

/** Returns all active licensed (non-metered) prices, sorted by sort_order for plan catalog display. */
const findAllActiveBasePrices = async (): Promise<StripePrice[]> =>
  await getActiveTx()
    .select()
    .from(stripePrices)
    .where(and(eq(stripePrices.usage_type, 'licensed'), eq(stripePrices.is_active, true)))
    .orderBy(asc(stripePrices.sort_order));

const upsertPrice = async (priceData: NewStripePrice): Promise<StripePrice> => {
  const [row] = await getActiveTx()
    .insert(stripePrices)
    .values(priceData)
    .onConflictDoUpdate({
      target: stripePrices.stripe_price_id,
      set: { ...priceData, updated_at: new Date() },
    })
    .returning();
  return row;
};

/** Update denormalized product display columns on all prices sharing a stripe_product_id. */
const upsertProductDisplayData = async (
  stripeProductId: string,
  displayData: {
    name?: string | null;
    display_name?: string | null;
    description?: string | null;
    features?: string[] | null;
    limits?: { users: number; invoices_per_month: number; storage_gb: number } | null;
    is_public?: boolean;
    sort_order?: number;
    image?: string | null;
  }
): Promise<void> => {
  await getActiveTx()
    .update(stripePrices)
    .set({ ...displayData, updated_at: new Date() })
    .where(eq(stripePrices.stripe_product_id, stripeProductId));
};

const deactivatePricesByProductId = async (stripeProductId: string): Promise<void> => {
  await getActiveTx()
    .update(stripePrices)
    .set({ is_active: false, updated_at: new Date() })
    .where(eq(stripePrices.stripe_product_id, stripeProductId));
};

const deletePrice = async (stripePriceId: string): Promise<void> => {
  await getActiveTx().delete(stripePrices).where(eq(stripePrices.stripe_price_id, stripePriceId));
};

/**
 * --- Subscription Line Items Operations ---
 */

const upsertLineItem = async (itemData: NewSubscriptionLineItem): Promise<SubscriptionLineItem> => {
  const [existing] = await getActiveTx()
    .select()
    .from(subscriptionLineItems)
    .where(eq(subscriptionLineItems.stripe_subscription_item_id, itemData.stripe_subscription_item_id))
    .limit(1);

  if (existing) {
    const [updated] = await getActiveTx()
      .update(subscriptionLineItems)
      .set({ ...itemData, updated_at: new Date() })
      .where(eq(subscriptionLineItems.id, existing.id))
      .returning();
    return updated;
  }

  const [created] = await getActiveTx().insert(subscriptionLineItems).values(itemData).returning();
  return created;
};

/**
 * --- Subscription Events Operations ---
 */

const createEvent = async (eventData: NewSubscriptionEvent): Promise<SubscriptionEvent> => {
  const [created] = await getActiveTx().insert(subscriptionEvents).values(eventData).returning();
  return created;
};

const findEventsBySubscriptionIdAndType = async (
  subscriptionId: string,
  eventType: SubscriptionEventType
): Promise<SubscriptionEvent[]> =>
  await getActiveTx()
    .select()
    .from(subscriptionEvents)
    .where(and(eq(subscriptionEvents.subscription_id, subscriptionId), eq(subscriptionEvents.event_type, eventType)))
    .orderBy(desc(subscriptionEvents.created_at));

export const subscriptionRepository = {
  // Prices
  findPriceByStripeId,
  findPriceByName,
  findPricesByProductId,
  findAllActiveBasePrices,
  findPriceByNameAndInterval,
  upsertPrice,
  upsertProductDisplayData,
  deactivatePricesByProductId,
  deletePrice,
  // Line Items
  upsertLineItem,
  // Events
  createEvent,
  findEventsBySubscriptionIdAndType,
};

export default subscriptionRepository;
