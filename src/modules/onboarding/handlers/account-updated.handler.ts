import { eq } from 'drizzle-orm';
import type Stripe from 'stripe';

import {
  stripeConnectedAccounts,
} from '@/modules/onboarding/schemas/onboarding.schema';
import { stripeAccountNormalizers } from '@/modules/onboarding/utils/stripeAccountNormalizers';
import { db } from '@/shared/database';
import { EventType } from '@/shared/events/enums/event-types';
import { publishSystemEvent, publishSimpleEvent, publishEventTx } from '@/shared/events/event-publisher';
import { SYSTEM_ACTOR_UUID, WEBHOOK_ACTOR_UUID } from '@/shared/events/constants';

/**
 * Handle account.updated webhook event
 *
 * Updates the connected account record in the database with latest status
 * and publishes an ONBOARDING_ACCOUNT_UPDATED event.
 * This is a pure function that doesn't depend on FastifyInstance.
 */
export const handleAccountUpdated = async (
  account: Stripe.Account,
): Promise<void> => {
  try {
    // First, get the current account data to retrieve organizationId
    const existingAccount = await db
      .select()
      .from(stripeConnectedAccounts)
      .where(eq(stripeConnectedAccounts.stripe_account_id, account.id))
      .limit(1);

    if (!existingAccount.length) {
      console.error(`Account not found for Stripe ID: ${account.id}`);
      return;
    }

    const currentAccount = existingAccount[0];

    const updateData = {
      charges_enabled: account.charges_enabled,
      payouts_enabled: account.payouts_enabled,
      details_submitted: account.details_submitted,
      business_type: account.business_type,
      company: stripeAccountNormalizers.normalizeCompany(account.company),
      individual: stripeAccountNormalizers.normalizeIndividual(account.individual),
      requirements: stripeAccountNormalizers.normalizeRequirements(account.requirements),
      capabilities: stripeAccountNormalizers.normalizeCapabilities(account.capabilities),
      externalAccounts: stripeAccountNormalizers.normalizeExternalAccounts(account.external_accounts),
      futureRequirements: stripeAccountNormalizers.normalizeFutureRequirements(account.future_requirements),
      tosAcceptance: stripeAccountNormalizers.normalizeTosAcceptance(account.tos_acceptance),
      metadata: account.metadata ?? undefined,
      last_refreshed_at: new Date(),
    };

    // Update the account in the database within transaction with event publishing
    await db.transaction(async (tx) => {
      await tx
        .update(stripeConnectedAccounts)
        .set(updateData)
        .where(eq(stripeConnectedAccounts.stripe_account_id, account.id));

      // Publish account updated event within transaction
      await publishEventTx(tx, {
        type: EventType.ONBOARDING_ACCOUNT_UPDATED,
        actorId: WEBHOOK_ACTOR_UUID,
        actorType: 'webhook',
        organizationId: currentAccount.organization_id,
        payload: {
          stripe_account_id: account.id,
          organization_id: currentAccount.organization_id,
          charges_enabled: account.charges_enabled,
          payouts_enabled: account.payouts_enabled,
          details_submitted: account.details_submitted,
          business_type: account.business_type,
          updated_at: new Date().toISOString(),
        },
      });
    });

    console.log(`Account updated and event published for: ${account.id}`);
  } catch (error) {
    console.error(`Failed to update account: ${account.id}`, error);
    throw error;
  }
};
