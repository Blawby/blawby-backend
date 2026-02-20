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
import { SYSTEM_ACTOR_UUID } from '@/shared/events/constants';
import type { Result } from '@/shared/types/result';
import { ok, internalError } from '@/shared/utils/result';
import { getStripeInstance } from '@/shared/utils/stripe-client';

const logger = getLogger(['subscriptions', 'services', 'metered-products']);

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
const reportMeteredUsage = async (
  db: NodePgDatabase<typeof schema>,
  organizationId: string,
  meteredType: string,
  quantity: number = 1,
  deduplicationId?: string,
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
    const dedupeSuffix = deduplicationId || Date.now().toString();

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
    await db.insert(schema.events).values({
      type: 'meter_usage.reported',
      eventVersion: '1.0.0',
      actorId: org.activeSubscriptionId || SYSTEM_ACTOR_UUID,
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
      return ok(undefined);
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
    let hasError = false;
    for (const item of missingItems) {
      try {
        await stripe.subscriptionItems.create({
          subscription: stripeSubscriptionId,
          price: item.price_id,
        });
      } catch (itemErr) {
        hasError = true;
        logger.error('Failed to add metered item {priceId} to subscription {subId}: {error}', {
          priceId: item.price_id,
          subId: stripeSubscriptionId,
          error: itemErr instanceof Error ? itemErr.message : 'Unknown error',
        });
      }
    }

    if (hasError) {
      return internalError('One or more metered items failed to attach to subscription');
    }

    return ok(undefined);
  } catch (error) {
    logger.error('Failed to ensure metered items: {error}', { error });
    return internalError('Failed to ensure subscription metered items');
  }
};

export const meteredProductsService = {
  reportMeteredUsage,
  getCurrentUsage,
  ensureSubscriptionMeteredItems,
};

export default meteredProductsService;
