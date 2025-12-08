/**
 * Subscription Events Repository
 *
 * Data access layer for subscription events (audit trail)
 */

import { eq, and, desc } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import * as schema from '@/schema';
import type {
  NewSubscriptionEvent,
  SubscriptionEvent,
  SubscriptionEventType,
} from '@/modules/subscriptions/database/schema/subscriptionEvents.schema';

/**
 * Create a new subscription event
 */
export const createEvent = async (
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
export const findBySubscriptionId = async (
  db: NodePgDatabase<typeof schema>,
  subscriptionId: string,
): Promise<SubscriptionEvent[]> => {
  return await db
    .select()
    .from(schema.subscriptionEvents)
    .where(eq(schema.subscriptionEvents.subscriptionId, subscriptionId))
    .orderBy(desc(schema.subscriptionEvents.createdAt));
};

/**
 * Find events by type for a subscription
 */
export const findBySubscriptionIdAndType = async (
  db: NodePgDatabase<typeof schema>,
  subscriptionId: string,
  _eventType: SubscriptionEventType,
): Promise<SubscriptionEvent[]> => {
  return await db
    .select()
    .from(schema.subscriptionEvents)
    .where(
      and(
        eq(schema.subscriptionEvents.subscriptionId, subscriptionId),
        eq(schema.subscriptionEvents.eventType, _eventType),
      ),
    )
    .orderBy(desc(schema.subscriptionEvents.createdAt));
};

/**
 * Get the most recent event for a subscription
 */
export const findLatestEvent = async (
  db: NodePgDatabase<typeof schema>,
  subscriptionId: string,
): Promise<SubscriptionEvent | undefined> => {
  const events = await db
    .select()
    .from(schema.subscriptionEvents)
    .where(eq(schema.subscriptionEvents.subscriptionId, subscriptionId))
    .orderBy(desc(schema.subscriptionEvents.createdAt))
    .limit(1);

  return events[0];
};

