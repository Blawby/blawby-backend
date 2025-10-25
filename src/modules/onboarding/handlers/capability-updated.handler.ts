import { eq } from 'drizzle-orm';
import type Stripe from 'stripe';
import { stripeConnectedAccounts } from '@/modules/onboarding/schemas/onboarding.schema';
import { db } from '@/shared/database';
import { EventType } from '@/shared/events/enums/event-types';
import { publishSystemEvent, publishSimpleEvent } from '@/shared/events/event-publisher';

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

    // Get current account record
    const account = await db
      .select()
      .from(stripeConnectedAccounts)
      .where(
        eq(
          stripeConnectedAccounts.stripe_account_id,
          capability.account as string,
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

    // Update capabilities JSONB field
    const currentCapabilities
      = (currentAccount.capabilities as Record<string, unknown>) || {};
    const updatedCapabilities = {
      ...currentCapabilities,
      [capability.id]: {
        status: capability.status,
        requirements: capability.requirements,
        requested: capability.requested,
        requested_at: capability.requested_at,
      },
    };

    // Update the account capabilities in the database
    await db
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

    // Publish capability updated event
    void publishSystemEvent(
      EventType.ONBOARDING_ACCOUNT_CAPABILITIES_UPDATED,
      {
        stripeAccountId: capability.account,
        organizationId: currentAccount.organization_id,
        capabilityId: capability.id,
        capabilityStatus: capability.status,
        capabilityRequirements: capability.requirements,
        requested: capability.requested,
        requestedAt: capability.requested_at,
        previousCapabilities: currentCapabilities,
        updatedAt: new Date().toISOString(),
      },
      'stripe-webhook',
      'webhook',
      currentAccount.organization_id,
    );

    // Publish simple capability updated event
    void publishSimpleEvent(EventType.ONBOARDING_ACCOUNT_CAPABILITIES_UPDATED, 'system', currentAccount.organization_id, {
      stripe_account_id: capability.account,
      organization_id: currentAccount.organization_id,
      capability_id: capability.id,
      capability_status: capability.status,
      requested: capability.requested,
      updated_at: new Date().toISOString(),
    });

    console.log(`Capability updated and event published for: ${capability.id}`);
  } catch (error) {
    console.error(`Failed to update capability: ${capability.id}`, error);
    throw error;
  }
};
