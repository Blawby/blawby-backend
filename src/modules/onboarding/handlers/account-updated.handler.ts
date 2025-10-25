import { eq } from 'drizzle-orm';
import type Stripe from 'stripe';

import {
  stripeConnectedAccounts,
  type Requirements,
  type Capabilities,
  type CompanyInfo,
  type IndividualInfo,
  ExternalAccounts,
} from '@/modules/onboarding/schemas/onboarding.schema';
import { db } from '@/shared/database';
import { EventType } from '@/shared/events/enums/event-types';
import { publishSystemEvent, publishSimpleEvent } from '@/shared/events/event-publisher';

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
      company: account.company as CompanyInfo,
      individual: account.individual as IndividualInfo,
      requirements: account.requirements as Requirements,
      capabilities: account.capabilities as Capabilities,
      external_accounts: account.external_accounts as ExternalAccounts,
      metadata: account.metadata as Stripe.Metadata,
      last_refreshed_at: new Date(),
    };

    // Update the account in the database
    await db
      .update(stripeConnectedAccounts)
      .set(updateData)
      .where(eq(stripeConnectedAccounts.stripe_account_id, account.id));

    // Publish account updated event
    void publishSystemEvent(
      EventType.ONBOARDING_ACCOUNT_UPDATED,
      {
        stripeAccountId: account.id,
        organizationId: currentAccount.organization_id,
        chargesEnabled: account.charges_enabled,
        payoutsEnabled: account.payouts_enabled,
        detailsSubmitted: account.details_submitted,
        businessType: account.business_type,
        requirements: account.requirements,
        capabilities: account.capabilities,
        previousChargesEnabled: currentAccount.charges_enabled,
        previousPayoutsEnabled: currentAccount.payouts_enabled,
        previousDetailsSubmitted: currentAccount.details_submitted,
        updatedAt: new Date().toISOString(),
      },
      'stripe-webhook',
      'webhook',
      currentAccount.organization_id,
    );

    // Publish simple onboarding account updated event
    void publishSimpleEvent(EventType.ONBOARDING_ACCOUNT_UPDATED, 'system', currentAccount.organization_id, {
      stripe_account_id: account.id,
      organization_id: currentAccount.organization_id,
      charges_enabled: account.charges_enabled,
      payouts_enabled: account.payouts_enabled,
      details_submitted: account.details_submitted,
      business_type: account.business_type,
      updated_at: new Date().toISOString(),
    });

    console.log(`Account updated and event published for: ${account.id}`);
  } catch (error) {
    console.error(`Failed to update account: ${account.id}`, error);
    throw error;
  }
};
