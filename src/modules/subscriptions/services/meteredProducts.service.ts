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
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { METERED_TYPE_TO_STRIPE_EVENT } from '@/modules/subscriptions/constants/meteredProducts';
import * as schema from '@/schema';
import { SYSTEM_ACTOR_UUID } from '@/shared/events/constants';
import type { Result } from '@/shared/types/result';
import { ok, internalError } from '@/shared/utils/result';
import { getStripeInstance } from '@/shared/utils/stripe-client';

const logger = getLogger(['subscriptions', 'services', 'metered-products']);

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
  db: NodePgDatabase<typeof schema>,
  organizationId: string,
  meteredType: keyof typeof METERED_TYPE_TO_STRIPE_EVENT,
  quantity: number = 1,
  deduplicationId?: string
): Promise<Result<void>> {
  try {
    // 1. Get organization's Stripe Customer ID
    const [org] = await db
      .select({
        stripeCustomerId: schema.organizations.stripeCustomerId,
      })
      .from(schema.organizations)
      .where(eq(schema.organizations.id, organizationId))
      .limit(1);

    if (!org?.stripeCustomerId) {
      logger.warn('No Stripe Customer ID for organization: {organizationId}', { organizationId });
      return ok(undefined);
    }

    // 2. Map internal type to Stripe Meter Event Name
    const eventName = METERED_TYPE_TO_STRIPE_EVENT[meteredType];

    if (!eventName) {
      logger.error('Unknown metered type: {meteredType} (org: {organizationId})', {
        meteredType,
        organizationId,
      });
      return internalError(`Unknown metered type: ${meteredType}`);
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
      await db.insert(schema.events).values({
        type: METER_USAGE_REPORTED,
        eventVersion: '1.0.0',
        actorId: SYSTEM_ACTOR_UUID, // Always use SYSTEM_ACTOR_UUID for system items
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
          environment: process.env.NODE_ENV || 'development',
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

    return ok(undefined);
  } catch (error) {
    logger.error('Failed to report metered usage for {meteredType}: {error}', { meteredType, error });
    return internalError('Failed to report metered usage');
  }
};

const getCurrentUsage = async function getCurrentUsage(
  db: NodePgDatabase<typeof schema>,
  organizationId: string
): Promise<Result<{ meter_name: string; quantity: number; description: string | null }[]>> {
  try {
    // 1. Get organization's active subscription to find current period start
    const [org] = await db
      .select({
        activeSubscriptionId: schema.organizations.activeSubscriptionId,
      })
      .from(schema.organizations)
      .where(eq(schema.organizations.id, organizationId))
      .limit(1);

    let periodStart: Date | null = null;
    if (org?.activeSubscriptionId) {
      const [sub] = await db
        .select({
          periodStart: schema.subscriptions.periodStart,
        })
        .from(schema.subscriptions)
        .where(eq(schema.subscriptions.id, org.activeSubscriptionId))
        .limit(1);
      periodStart = sub?.periodStart ?? null;
    }

    // 2. Aggregate usage within the current period
    const usage = await db
      .select({
        meter_name: sql<string>`${schema.events.payload}->>'meter_event_name'`,
        quantity: sql<number>`CAST(SUM(CAST(${schema.events.payload}->>'quantity' AS NUMERIC)) AS INTEGER)`,
      })
      .from(schema.events)
      .where(
        and(
          eq(schema.events.organizationId, organizationId),
          eq(schema.events.type, METER_USAGE_REPORTED),
          periodStart ? sql`${schema.events.createdAt} >= ${periodStart}` : undefined
        )
      )
      .groupBy(sql`${schema.events.payload}->>'meter_event_name'`);

    return ok(usage.map((u) => ({ ...u, description: null })));
  } catch (error) {
    logger.error('Failed to get current usage for org {organizationId}: {error}', { organizationId, error });
    return internalError('Failed to retrieve usage data');
  }
};

export const meteredProductsService = {
  reportMeteredUsage,
  getCurrentUsage,
};

export default meteredProductsService;
