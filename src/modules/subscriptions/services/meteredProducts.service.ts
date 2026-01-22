/**
 * Metered Products Service
 *
 * Handles lazy attachment of metered products to subscriptions
 * Metered products are only attached when features are first used
 *
 * This service uses a database-driven approach - metered items are configured
 * in the subscription_plans.metered_items JSONB field
 */

import { eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { getLogger } from '@logtape/logtape';
import * as schema from '@/schema';
import { getStripeInstance } from '@/shared/utils/stripe-client';
import { subscriptionRepository } from '@/modules/subscriptions/database/queries/subscription.repository';
import {
  getMeteredItemsForOrganization,
  getMeteredItemByType,
} from '../constants/meteredProducts';
import type { MeteredItem } from '../constants/meteredProducts';
import type { Result } from '@/shared/types/result';
import { ok, badRequest, internalError, notFound } from '@/shared/utils/result';

const logger = getLogger(['subscriptions', 'services', 'metered-products']);

/**
 * Ensure a metered product is attached to a subscription
 * This function is idempotent - safe to call multiple times
 *
 * @param db - Database instance
 * @param organizationId - Organization UUID
 * @param meteredItem - Metered item configuration from database
 * @returns Result with Stripe subscription item ID
 */
const ensureMeteredProduct = async (
  db: NodePgDatabase<typeof schema>,
  organizationId: string,
  meteredItem: MeteredItem,
): Promise<Result<string>> => {
  try {
    // 1. Get organization's active subscription
    const [org] = await db
      .select()
      .from(schema.organizations)
      .where(eq(schema.organizations.id, organizationId))
      .limit(1);

    if (!org?.activeSubscriptionId) {
      logger.warn('No active subscription for organization: {organizationId}', { organizationId });
      return badRequest('No active subscription found for this organization');
    }

    // 2. Check if metered product is already attached
    const lineItems = await subscriptionRepository.findLineItemsBySubscriptionId(
      db,
      org.activeSubscriptionId,
    );

    const existingItem = lineItems.find(
      (item) => item.stripePriceId === meteredItem.priceId,
    );

    if (existingItem) {
      logger.debug('Metered product already attached: {meterName} (org: {organizationId})', {
        meterName: meteredItem.meterName,
        organizationId
      });
      return ok(existingItem.stripeSubscriptionItemId);
    }

    // 3. Get Stripe subscription ID from Better Auth subscriptions table
    const [betterAuthSub] = await db
      .select()
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.id, org.activeSubscriptionId))
      .limit(1);

    if (!betterAuthSub?.stripeSubscriptionId) {
      return internalError('Stripe subscription ID not found');
    }

    // 4. Attach metered product to subscription via Stripe API
    const stripe = getStripeInstance();
    const subscriptionItem = await stripe.subscriptionItems.create({
      subscription: betterAuthSub.stripeSubscriptionId,
      price: meteredItem.priceId,
      metadata: {
        meter_name: meteredItem.meterName,
        item_type: meteredItem.type,
        organization_id: organizationId,
      },
    });

    // 5. Save subscription item to database
    await subscriptionRepository.upsertLineItem(db, {
      subscriptionId: org.activeSubscriptionId,
      stripeSubscriptionItemId: subscriptionItem.id,
      stripePriceId: meteredItem.priceId,
      itemType: meteredItem.type as
        | 'metered_invoice_fee'
        | 'metered_users'
        | 'metered_custom_payment_fee'
        | 'metered_payout_fee',
      quantity: 0, // Metered items start at 0
      unitAmount: subscriptionItem.price.unit_amount
        ? (subscriptionItem.price.unit_amount / 100).toString()
        : null,
      description: meteredItem.meterName,
      metadata: {
        meter_name: meteredItem.meterName,
        auto_attached: 'true',
        attached_at: new Date().toISOString(),
      },
    });

    logger.info('Attached metered product: {meterName} to organization {organizationId}', {
      meterName: meteredItem.meterName,
      organizationId
    });
    return ok(subscriptionItem.id);
  } catch (error) {
    logger.error('Failed to ensure metered product {meterName} for org {organizationId}: {error}', {
      meterName: meteredItem.meterName,
      organizationId,
      error
    });
    return internalError('Failed to attach metered product');
  }
};

/**
 * Report metered usage for a subscription by type
 * Automatically attaches the metered product if not already attached
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
    // 1. Get organization's metered items from their subscription plan
    const meteredItems = await getMeteredItemsForOrganization(db, organizationId);

    if (meteredItems.length === 0) {
      logger.debug('No metered items configured for organization: {organizationId}', { organizationId });
      return ok(undefined);
    }

    // 2. Find the specific metered item by type
    const meteredItem = getMeteredItemByType(meteredItems, meteredType);

    if (!meteredItem) {
      logger.debug('Metered item type "{meteredType}" not configured for organization: {organizationId}', {
        meteredType,
        organizationId
      });
      return ok(undefined);
    }

    // 3. Ensure metered product is attached (idempotent operation)
    const result = await ensureMeteredProduct(
      db,
      organizationId,
      meteredItem,
    );

    if (!result.success) {
      return result;
    }

    const subscriptionItemId = result.data;

    // 4. Report usage to Stripe
    const stripe = getStripeInstance();

    // Stripe API: Create usage record for the subscription item
    // @ts-expect-error - Stripe API types may be outdated
    await stripe.subscriptionItems.createUsageRecord(subscriptionItemId, {
      quantity,
      timestamp: Math.floor(Date.now() / 1000),
    });

    logger.info('Usage reported: {meterName} +{quantity} (org: {organizationId})', {
      meterName: meteredItem.meterName,
      quantity,
      organizationId
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
  db: NodePgDatabase<typeof schema>,
  organizationId: string,
): Promise<Result<
  Array<{ meterName: string; quantity: number; description: string | null }>
>> => {
  try {
    // Get organization's subscription
    const [org] = await db
      .select()
      .from(schema.organizations)
      .where(eq(schema.organizations.id, organizationId))
      .limit(1);

    if (!org?.activeSubscriptionId) {
      return ok([]);
    }

    // Get all metered line items
    const lineItems = await subscriptionRepository.findLineItemsBySubscriptionId(
      db,
      org.activeSubscriptionId,
    );

    const meteredItems = lineItems.filter((item) =>
      item.itemType.startsWith('metered_'),
    );

    const summary = meteredItems.map((item) => {
      const meterNameValue = (item.metadata as Record<string, unknown>)?.meter_name;
      const meterName = typeof meterNameValue === 'string'
        ? meterNameValue
        : (item.description || 'unknown');
      return {
        meterName,
        quantity: item.quantity,
        description: item.description,
      };
    });

    return ok(summary);
  } catch (error) {
    logger.error('Failed to get current usage for org {organizationId}: {error}', { organizationId, error });
    return internalError('Failed to retrieve usage summary');
  }
};

export const meteredProductsService = {
  ensureMeteredProduct,
  reportMeteredUsage,
  getCurrentUsage,
};

export default meteredProductsService;
