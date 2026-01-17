import { eq } from 'drizzle-orm';
import type Stripe from 'stripe';
import { stripeConnectedAccounts } from '@/modules/onboarding/schemas/onboarding.schema';
import { db } from '@/shared/database';
import { EventType } from '@/shared/events/enums/event-types';
import { publishEventTx, WEBHOOK_ACTOR_UUID } from '@/shared/events/event-publisher';

/**
 * Handle capability.updated webhook event
 *
 * Updates the connected account capabilities in the database
 * and publishes an ONBOARDING_ACCOUNT_CAPABILITIES_UPDATED event.
 * This is a pure function that doesn't depend on FastifyInstance.
 */
export const handleCapabilityUpdated = async (
  capability: Stripe.Capability,
): Promise<void> => {
  try {
    console.log(
      `Processing capability.updated: ${capability.id} for account: ${capability.account}`,
    );
    const stripeAccountId = typeof capability.account === 'string'
      ? capability.account
      : null;
    if (!stripeAccountId) {
      console.warn(`Missing Stripe account ID for capability: ${capability.id}`);
      return;
    }

    // Get current account record
    const account = await db
      .select()
      .from(stripeConnectedAccounts)
      .where(
        eq(
          stripeConnectedAccounts.stripe_account_id,
          stripeAccountId,
        ),
      )
      .limit(1);

    if (account.length === 0) {
      console.warn(
        `Account not found for capability update: ${capability.account}`,
      );
      return;
    }

    const currentAccount = account[0];

    const currentCapabilities = currentAccount.capabilities ?? {};
    const updatedCapabilities: Record<string, string> = {
      ...currentCapabilities,
      [capability.id]: capability.status,
    };

    // Update the account capabilities in the database within transaction with event publishing
    await db.transaction(async (tx) => {
      await tx
        .update(stripeConnectedAccounts)
        .set({
          capabilities: updatedCapabilities,
          last_refreshed_at: new Date(),
        })
        .where(
          eq(
            stripeConnectedAccounts.stripe_account_id,
            capability.account as string,
          ),
        );

      // Publish capability updated event within transaction
      await publishEventTx(tx, {
        type: EventType.ONBOARDING_ACCOUNT_CAPABILITIES_UPDATED,
        actorId: WEBHOOK_ACTOR_UUID,
        actorType: 'webhook',
        organizationId: currentAccount.organization_id,
        payload: {
          stripe_account_id: capability.account,
          organization_id: currentAccount.organization_id,
          capability_id: capability.id,
          capability_status: capability.status,
          requested: capability.requested,
          updated_at: new Date().toISOString(),
        },
      });
    });

    console.log(`Capability updated and event published for: ${capability.id}`);
  } catch (error) {
    console.error(`Failed to update capability: ${capability.id}`, error);
    throw error;
  }
};
