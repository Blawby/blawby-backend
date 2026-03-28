/**
 * Seat Metering Service
 *
 * Implements "Absolute Total" seat-based billing using Stripe Metering.
 * Strategy: Query current member count and report as absolute value to Stripe.
 * This is stateless and self-correcting — both invoice.upcoming and invoice.created
 * report the same total, idempotent via sync_{invoice.id}.
 *
 * Stripe Meter Configuration Required:
 * - aggregation_method: 'last' (takes the most recent value reported)
 */

import { getLogger } from '@logtape/logtape';
import { eq, count } from 'drizzle-orm';
import type { Stripe } from 'stripe';
import { members } from '@/schema/better-auth-schema';
import type { db as appDb } from '@/shared/database';
import { getStripeInstance } from '@/shared/utils/stripe-client';

const logger = getLogger(['subscriptions', 'seat-metering']);

type DbOrTx = typeof appDb | Parameters<Parameters<typeof appDb.transaction>[0]>[0];

/**
 * Get the current member count for an organization
 *
 * @param db - Database instance or transaction
 * @param organizationId - Organization UUID
 * @returns Current total count of active members
 */
const getMemberCountForOrganization = async (db: DbOrTx, organizationId: string): Promise<number> => {
  const result = await db
    .select({ count: count(members.id) })
    .from(members)
    .where(eq(members.organizationId, organizationId));

  return result[0]?.count ?? 0;
};

/**
 * Report absolute member count to Stripe Metering API
 *
 * This function implements the "Absolute Total" strategy:
 * 1. Query the database for current member count
 * 2. Send the absolute total to Stripe Metering API
 * 3. Use idempotency key: sync_{invoice.id}
 *
 * The Stripe meter is configured with aggregation_method: 'last',
 * so it always uses the most recent value reported.
 *
 * Throws on error — caller (syncSeatCountOnInvoice) handles non-blocking error handling.
 *
 * @param db - Database instance or transaction
 * @param organizationId - Organization UUID
 * @param idempotencyIdentifier - Stable idempotency identifier for invoice event
 * @param stripeCustomerId - Stripe Customer ID for the organization
 */
const reportAbsoluteSeatCount = async (
  db: DbOrTx,
  organizationId: string,
  idempotencyIdentifier: string,
  stripeCustomerId: string
): Promise<void> => {
  // 1. Query current member count
  const memberCount = await getMemberCountForOrganization(db, organizationId);

  // 2. Prepare Stripe Metering API call
  const stripe = getStripeInstance();
  const idempotencyKey = `sync_${idempotencyIdentifier}`;

  logger.info(
    'Reporting absolute seat count to Stripe: {memberCount} seats for {organizationId} (id: {idempotencyIdentifier})',
    {
      memberCount,
      organizationId,
      idempotencyIdentifier,
    }
  );

  // 3. Call Stripe Metering API with idempotency
  await stripe.v2.billing.meterEvents.create({
    event_name: 'active_user_count', // Stripe Meter name
    identifier: idempotencyKey, // Idempotency: same invoice → same identifier
    payload: {
      stripe_customer_id: stripeCustomerId,
      value: memberCount.toString(),
    },
  });

  logger.info('✅ Seat count reported to Stripe: {memberCount} seats via {idempotencyIdentifier}', {
    memberCount,
    idempotencyIdentifier,
  });
};

const buildSeatSyncIdentifier = (invoice: Stripe.Invoice, organizationId: string, stripeCustomerId: string): string => {
  if (invoice.id) {
    return invoice.id;
  }

  const periodStart =
    typeof invoice.period_start === 'number' ? invoice.period_start : (invoice.lines.data[0]?.period?.start ?? 0);

  return `upcoming_${stripeCustomerId}_${organizationId}_${periodStart}`;
};

/**
 * Sync seat count on invoice events (invoice.upcoming and invoice.created)
 *
 * Called by invoice webhooks to maintain seat-based billing accuracy.
 * Uses the "Absolute Total" strategy with idempotent identifiers.
 *
 * Non-blocking: Catches and logs errors without re-throwing,
 * so metering failures don't block invoice webhook processing.
 *
 * Returns boolean indicating success/failure for caller visibility.
 *
 * @param db - Database instance or transaction
 * @param invoice - Stripe Invoice object
 * @param organizationId - Organization UUID
 * @param stripeCustomerId - Stripe Customer ID
 * @returns true if seat sync succeeded, false if it failed
 */
const syncSeatCountOnInvoice = async (
  db: DbOrTx,
  invoice: Stripe.Invoice,
  organizationId: string,
  stripeCustomerId: string
): Promise<boolean> => {
  try {
    const idempotencyIdentifier = buildSeatSyncIdentifier(invoice, organizationId, stripeCustomerId);
    await reportAbsoluteSeatCount(db, organizationId, idempotencyIdentifier, stripeCustomerId);
    return true;
  } catch (error) {
    // Log but don't throw — metering should not block invoice webhook processing
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.warn('Seat metering failed for identifier {idempotencyIdentifier}: {error}', {
      idempotencyIdentifier: buildSeatSyncIdentifier(invoice, organizationId, stripeCustomerId),
      error: message,
    });
    return false;
  }
};

/**
 * Seat Metering Service
 *
 * Exports for external use
 */
export const seatMeteringService = {
  getMemberCountForOrganization,
  reportAbsoluteSeatCount,
  syncSeatCountOnInvoice,
};
