/**
 * Metered Products Service
 *
 * Handles reporting of metered usage to Stripe Billing Meters
 *
 * This service uses the new Stripe Billing Meters API (v2) where usage is reported
 * directly against a customer and meter event name, without needing to attach
 * subscription items first.
 */

import { getLogger } from '@logtape/logtape';
import { sql, and, eq } from 'drizzle-orm';
import { METERED_TYPE_TO_STRIPE_EVENT } from '@/modules/subscriptions/constants/meteredProducts';
import { organizations, subscriptionLineItems, subscriptions, events } from '@/schema';
import { config } from '@/shared/config';
import { db as appDb } from '@/shared/database';
import { SYSTEM_ACTOR_UUID } from '@/shared/events/constants';
import { getStripeInstance } from '@/shared/utils/stripe-client';

const logger = getLogger(['subscriptions', 'services', 'metered-products']);

type DbOrTx = typeof appDb | Parameters<Parameters<typeof appDb.transaction>[0]>[0];

const METER_USAGE_REPORTED = 'meter_usage.reported';

/**
 * Report metered usage for a subscription by type
 *
 * This function is designed to be called asynchronously (fire-and-forget)
 * and will not throw errors to avoid disrupting the main feature flow.
 *
 * @param db - Database instance
 * @param organizationId - Organization UUID
 * @param meteredType - Standardized metered type (see METERED_TYPES)
 * @param quantity - Amount to report
 * @param deduplicationId - Optional stable key to prevent double reporting on retries
 */
const reportMeteredUsage = async function reportMeteredUsage(
  db: DbOrTx,
  organizationId: string,
  meteredType: keyof typeof METERED_TYPE_TO_STRIPE_EVENT,
  quantity = 1,
  deduplicationId?: string
): Promise<void> {
  // 1. Get organization's Stripe Customer ID
  const [org] = await db
    .select({
      stripeCustomerId: organizations.stripeCustomerId,
    })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);

  if (!org?.stripeCustomerId) {
    logger.warn('No Stripe Customer ID for organization: {organizationId}', { organizationId });
    return;
  }

  // 2. Map internal type to Stripe Meter Event Name
  const eventName = METERED_TYPE_TO_STRIPE_EVENT[meteredType];

  if (!eventName) {
    logger.error('Unknown metered type: {meteredType} (org: {organizationId})', {
      meteredType,
      organizationId,
    });
    throw new Error(`Unknown metered type: ${meteredType}`);
  }

  // 3. Report usage to Stripe Billing Meters API
  const stripe = getStripeInstance();
  const dedupeSuffix = deduplicationId ?? Date.now().toString();

  // Use Stripe v2 Billing Meters API for synchronous validation and deduplication
  await stripe.v2.billing.meterEvents.create({
    event_name: eventName,
    identifier: `${organizationId}-${meteredType}-${dedupeSuffix}`,
    payload: {
      stripe_customer_id: org.stripeCustomerId,
      value: quantity.toString(),
    },
  });

  // 4. Log event to global events table for audit trail
  // We wrap this in its own try/catch to avoid failing the report if DB insert fails
  try {
    await db.insert(events).values({
      type: METER_USAGE_REPORTED,
      eventVersion: '1.0.0',
      actorId: SYSTEM_ACTOR_UUID,
      actorType: 'system',
      organizationId: organizationId,
      payload: {
        meter_event_name: eventName,
        quantity,
        stripe_customer_id: org.stripeCustomerId,
        metered_type: meteredType,
      },
      metadata: {
        source: 'metered-products-service',
        environment: config.env.node,
      },
    });
  } catch (dbError) {
    logger.error(
      'Failed to log meter usage audit for {meteredType} (org: {organizationId}, dedupe: {dedupeId}): {error}',
      {
        meteredType,
        organizationId,
        dedupeId: deduplicationId,
        error: dbError instanceof Error ? dbError.message : 'Unknown error',
      }
    );
  }
};

const getCurrentUsage = async function getCurrentUsage(
  db: DbOrTx,
  organizationId: string
): Promise<{ meter_name: string; quantity: number; description: string | null }[]> {
  // 1. Get organization's active subscription to find current period start
  const [org] = await db
    .select({
      activeSubscriptionId: organizations.activeSubscriptionId,
    })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);

  let periodStart: Date | null = null;
  if (org?.activeSubscriptionId) {
    const [sub] = await db
      .select({
        periodStart: subscriptions.periodStart,
      })
      .from(subscriptions)
      .where(eq(subscriptions.id, org.activeSubscriptionId))
      .limit(1);
    periodStart = sub?.periodStart ?? null;
  }

  // 2. Aggregate usage within the current period
  const usage = await db
    .select({
      meter_name: sql<string>`${events.payload}->>'meter_event_name'`,
      quantity: sql<number>`CAST(SUM(CAST(${events.payload}->>'quantity' AS INTEGER)) AS INTEGER)`,
    })
    .from(events)
    .where(
      and(
        eq(events.organizationId, organizationId),
        eq(events.type, METER_USAGE_REPORTED),
        periodStart ? sql`${events.createdAt} >= ${periodStart}` : undefined
      )
    )
    .groupBy(sql`${events.payload}->>'meter_event_name'`);

  return usage.map((u) => ({ ...u, description: null }));
};

export const meteredProductsService = {
  reportMeteredUsage,
  getCurrentUsage,
};

export default meteredProductsService;
