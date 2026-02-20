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
import { eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import {
  METERED_TYPE_TO_STRIPE_EVENT,
  type MeteredItem,
} from '@/modules/subscriptions/constants/meteredProducts';
import * as schema from '@/schema';
import type { Result } from '@/shared/types/result';
import { ok, internalError } from '@/shared/utils/result';
import { getStripeInstance } from '@/shared/utils/stripe-client';

const logger = getLogger(['subscriptions', 'services', 'metered-products']);

/**
 * Report metered usage for a subscription by type
 *
 * This function is designed to be called asynchronously (fire-and-forget)
 * and will not throw errors to avoid disrupting the main feature flow
 */
const reportMeteredUsage = async (
  db: NodePgDatabase<typeof schema>,
  organizationId: string,
  meteredType: string,
  quantity: number = 1,
): Promise<Result<void>> => {
  try {
    // 1. Get organization's Stripe Customer ID
    const [org] = await db
      .select({
        stripeCustomerId: schema.organizations.stripeCustomerId,
        activeSubscriptionId: schema.organizations.activeSubscriptionId,
      })
      .from(schema.organizations)
      .where(eq(schema.organizations.id, organizationId))
      .limit(1);

    if (!org?.stripeCustomerId) {
      logger.warn('No Stripe Customer ID for organization: {organizationId}', { organizationId });
      return ok(undefined); // Not an error strictly, just can't report usage (maybe not onboarded yet)
    }

    // 2. Map internal type to Stripe Meter Event Name
    const eventName = METERED_TYPE_TO_STRIPE_EVENT[meteredType];

    if (!eventName) {
      logger.warn('Unknown metered type: {meteredType} (org: {organizationId})', {
        meteredType,
        organizationId,
      });
      return ok(undefined);
    }

    // 3. Report usage to Stripe Billing Meters API
    const stripe = getStripeInstance();

    // The Stripe Billing Meters API expects a timestamp for the event
    // Using current time as default
    await stripe.billing.meterEvents.create({
      event_name: eventName,
      payload: {
        stripe_customer_id: org.stripeCustomerId,
        value: quantity.toString(),
      },
    });

    // 4. Log event to global events table for audit trail
    // We log this as a 'system' actor event
    await db.insert(schema.events).values({
      type: 'meter_usage.reported', // Dot notation for event types
      eventVersion: '1.0.0',
      actorId: org.activeSubscriptionId || '00000000-0000-0000-0000-000000000000', // Use subscription ID as actor if available
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


    return ok(undefined);
  } catch (error) {
    // Log error but avoid throwing if possible for usage reporting
    logger.error('Failed to report metered usage for {meteredType}: {error}', { meteredType, error });
    return internalError('Failed to report metered usage');
  }
};

/**
 * Get current usage summary for an organization
 *
 * @param db - Database instance
 * @param organizationId - Organization UUID
 * @returns Result with array of usage records
 */
const getCurrentUsage = async (
  _db: NodePgDatabase<typeof schema>,
  _organizationId: string,
): Promise<Result<
  Array<{ meter_name: string; quantity: number; description: string | null }>
>> => {
  // fetching real-time meter usage aggregated by billing period is complex
  // and requires calling stripe.billing.meters.listEventSummaries for each meter
  // For now, we return empty structure as this UI feature is low priority
  return ok([]);
};

/**
 * Ensure subscription has all required metered items attached
 *
 * @param stripeSubscriptionId - Stripe Subscription ID
 * @param meteredItems - Array of metered items from the plan
 */
const ensureSubscriptionMeteredItems = async (
  stripeSubscriptionId: string,
  meteredItems: MeteredItem[],
): Promise<Result<void>> => {
  try {
    if (meteredItems.length === 0) {
      return ok(undefined);
    }

    const stripe = getStripeInstance();
    const subscription = await stripe.subscriptions.retrieve(stripeSubscriptionId);

    if (!subscription || subscription.status === 'canceled') {
      return ok(undefined); // Ignore canceled subscriptions
    }

    // Identify which items are missing
    const existingPriceIds = new Set(
      subscription.items.data.map((item) => item.price.id),
    );

    const missingItems = meteredItems.filter(
      (item) => !existingPriceIds.has(item.price_id),
    );

    if (missingItems.length === 0) {
      return ok(undefined);
    }

    logger.info('Adding missing metered items to subscription {subId}', {
      subId: stripeSubscriptionId,
      missingCount: missingItems.length,
    });

    // Add missing items
    // We add them sequentially to avoid rate limits or race conditions on the same sub
    for (const item of missingItems) {
      await stripe.subscriptionItems.create({
        subscription: stripeSubscriptionId,
        price: item.price_id,
      });
    }

    return ok(undefined);
  } catch (error) {
    logger.error('Failed to ensure metered items: {error}', { error });
    // We return OK to not block the main sync process, but we log the error
    return ok(undefined);
  }
};

export const meteredProductsService = {
  reportMeteredUsage,
  getCurrentUsage,
  ensureSubscriptionMeteredItems,
};

export default meteredProductsService;
