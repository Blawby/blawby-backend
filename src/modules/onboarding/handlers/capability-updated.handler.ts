import { getLogger } from '@logtape/logtape';
import { eq, sql } from 'drizzle-orm';
import type Stripe from 'stripe';
import { stripeConnectedAccounts } from '@/modules/onboarding/schemas/onboarding.schema';
import { db } from '@/shared/database';
import { EventType } from '@/shared/events/enums/event-types';
import { publishEventTx, WEBHOOK_ACTOR_UUID } from '@/shared/events/event-publisher';

const logger = getLogger(['onboarding', 'handler', 'capability-updated']);

/**
 * Handle capability.updated webhook event
 *
 * Updates the connected account capabilities in the database
 * and publishes an ONBOARDING_ACCOUNT_CAPABILITIES_UPDATED event.
 * Optimized to use .returning() to avoid redundant SELECT.
 */
export const handleCapabilityUpdated = async (
  capability: Stripe.Capability,
): Promise<void> => {
  try {
    const stripeAccountId = typeof capability.account === 'string'
      ? capability.account
      : null;

    if (!stripeAccountId) {
      logger.warn("Missing Stripe account ID for capability: {capabilityId}", { capabilityId: capability.id });
      return;
    }

    logger.debug(
      "Processing capability.updated: {capabilityId} for account: {stripeAccountId}",
      { capabilityId: capability.id, stripeAccountId }
    );

    // Update capabilities using SQL jsonb merge and return organization_id
    // This assumes PG 9.5+ for || operator on jsonb, or we can use returning() after a find
    // Since we need the current capabilities to merge in JS (to be safe with Drizzle's type system),
    // we'll still do a SELECT but we'll consolidate the transaction.

    // Actually, let's see if we can do it effectively without a redundant SELECT.
    // If we want to be truly efficient, we use jsonb_set or || in SQL.

    await db.transaction(async (tx) => {
      const [record] = await tx
        .update(stripeConnectedAccounts)
        .set({
          capabilities: sql`${stripeConnectedAccounts.capabilities} || ${JSON.stringify({ [capability.id]: capability.status })}::jsonb`,
          last_refreshed_at: new Date(),
        })
        .where(eq(stripeConnectedAccounts.stripe_account_id, stripeAccountId))
        .returning({ organization_id: stripeConnectedAccounts.organization_id });

      if (!record) {
        logger.warn("Account not found for capability update: {stripeAccountId}", { stripeAccountId });
        return;
      }

      // Publish capability updated event within transaction
      await publishEventTx(tx, {
        type: EventType.ONBOARDING_ACCOUNT_CAPABILITIES_UPDATED,
        actorId: WEBHOOK_ACTOR_UUID,
        actorType: 'webhook',
        organizationId: record.organization_id,
        payload: {
          stripe_account_id: stripeAccountId,
          organization_id: record.organization_id,
          capability_id: capability.id,
          capability_status: capability.status,
          requested: capability.requested,
          updated_at: new Date().toISOString(),
        },
      });
    });

    logger.info("Capability updated and event published for: {capabilityId}", { capabilityId: capability.id });
  } catch (error) {
    logger.error("Failed to update capability: {capabilityId} {error}", { capabilityId: capability.id, error });
    throw error;
  }
};
