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
 * Handle account.external_account.deleted webhook event
 *
 * Removes external account information (bank accounts, cards) from the database
 * and publishes an ONBOARDING_EXTERNAL_ACCOUNT_DELETED event.
 * This is a pure function that doesn't depend on FastifyInstance.
 */
export const handleExternalAccountDeleted = async (
  externalAccount: Stripe.ExternalAccount,
): Promise<void> => {
  try {
    const accountType
      = (externalAccount as Stripe.ExternalAccount & { type?: string }).type
      || 'unknown';
    console.log(
      `Processing external_account.deleted: ${externalAccount.id} (${accountType}) for account: ${externalAccount.account}`,
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
        `Account not found for external account deletion: ${externalAccount.account}`,
      );
      return;
    }

    const currentAccount = account[0];

    // Remove external account from JSONB field
    const currentExternalAccounts
      = (currentAccount.externalAccounts as Record<string, unknown>) || {};
    const updatedExternalAccounts = { ...currentExternalAccounts };
    delete updatedExternalAccounts[externalAccount.id];

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

    // Publish external account deleted event
    void publishSystemEvent(
      EventType.ONBOARDING_EXTERNAL_ACCOUNT_DELETED,
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

    // Publish simple external account deleted event
    void publishSimpleEvent(EventType.ONBOARDING_EXTERNAL_ACCOUNT_DELETED, 'system', currentAccount.organization_id, {
      stripe_account_id: externalAccount.account,
      organization_id: currentAccount.organization_id,
      external_account_id: externalAccount.id,
      external_account_type: accountType,
      deleted_at: new Date().toISOString(),
    });

    console.log(
      `External account deleted and event published for: ${externalAccount.id}`,
    );
  } catch (error) {
    console.error(
      `Failed to delete external account: ${externalAccount.id}`,
      error,
    );
    throw error;
  }
};
