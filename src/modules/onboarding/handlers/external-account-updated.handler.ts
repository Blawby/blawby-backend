import { eq } from 'drizzle-orm';
import type Stripe from 'stripe';

import {
  stripeConnectedAccounts,
  ExternalAccounts,
} from '@/modules/onboarding/schemas/onboarding.schema';
import { db } from '@/shared/database';
import { EventType } from '@/shared/events/enums/event-types';
import { publishSystemEvent, publishSimpleEvent } from '@/shared/events/event-publisher';

/**
 * Handle account.external_account.updated webhook event
 *
 * Updates external account information (bank accounts, cards) in the database
 * and publishes an ONBOARDING_EXTERNAL_ACCOUNT_UPDATED event.
 * This is a pure function that doesn't depend on FastifyInstance.
 */
export const handleExternalAccountUpdated = async (
  externalAccount: Stripe.ExternalAccount,
): Promise<void> => {
  try {
    const accountType
      = (externalAccount as Stripe.ExternalAccount & { type?: string }).type
      || 'unknown';
    console.log(
      `Processing external_account.updated: ${externalAccount.id} (${accountType}) for account: ${externalAccount.account}`,
    );

    // Get current account record
    const account = await db
      .select()
      .from(stripeConnectedAccounts)
      .where(
        eq(
          stripeConnectedAccounts.stripe_account_id,
          externalAccount.account as string,
        ),
      )
      .limit(1);

    if (account.length === 0) {
      console.warn(
        `Account not found for external account update: ${externalAccount.account}`,
      );
      return;
    }

    const currentAccount = account[0];

    // Update external accounts JSONB field
    const currentExternalAccounts
      = (currentAccount.externalAccounts as Record<string, unknown>) || {};
    const updatedExternalAccounts = {
      ...currentExternalAccounts,
      [externalAccount.id]: {
        id: externalAccount.id,
        type: accountType,
        status: externalAccount.status,
        metadata: externalAccount.metadata,
        // Store additional fields based on type
        ...(accountType === 'card' && {
          brand: (externalAccount as Stripe.Card).brand,
          last4: (externalAccount as Stripe.Card).last4,
          exp_month: (externalAccount as Stripe.Card).exp_month,
          exp_year: (externalAccount as Stripe.Card).exp_year,
        }),
        ...(accountType === 'bank_account' && {
          bank_name: (externalAccount as Stripe.BankAccount).bank_name,
          last4: (externalAccount as Stripe.BankAccount).last4,
          routing_number: (externalAccount as Stripe.BankAccount)
            .routing_number,
        }),
      },
    };

    // Update the account external accounts in the database
    await db
      .update(stripeConnectedAccounts)
      .set({
        externalAccounts:
          updatedExternalAccounts as unknown as ExternalAccounts,
        last_refreshed_at: new Date(),
      })
      .where(
        eq(
          stripeConnectedAccounts.stripe_account_id,
          externalAccount.account as string,
        ),
      );

    // Publish external account updated event
    void publishSystemEvent(
      EventType.ONBOARDING_EXTERNAL_ACCOUNT_UPDATED,
      {
        stripeAccountId: externalAccount.account,
        organizationId: currentAccount.organization_id,
        externalAccountId: externalAccount.id,
        externalAccountType: accountType,
        externalAccountStatus: externalAccount.status,
        metadata: externalAccount.metadata,
        previousExternalAccounts: currentExternalAccounts,
        updatedAt: new Date().toISOString(),
      },
      'stripe-webhook',
      'webhook',
      currentAccount.organization_id,
    );

    // Publish simple external account updated event
    void publishSimpleEvent(EventType.ONBOARDING_EXTERNAL_ACCOUNT_UPDATED, 'system', currentAccount.organization_id, {
      stripe_account_id: externalAccount.account,
      organization_id: currentAccount.organization_id,
      external_account_id: externalAccount.id,
      external_account_type: accountType,
      external_account_status: externalAccount.status,
      updated_at: new Date().toISOString(),
    });

    console.log(
      `External account updated and event published for: ${externalAccount.id}`,
    );
  } catch (error) {
    console.error(
      `Failed to update external account: ${externalAccount.id}`,
      error,
    );
    throw error;
  }
};
