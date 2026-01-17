import { eq } from 'drizzle-orm';
import type Stripe from 'stripe';

import {
  stripeConnectedAccounts,
  type ExternalAccount,
  ExternalAccounts,
} from '@/modules/onboarding/schemas/onboarding.schema';
import { db } from '@/shared/database';
import { EventType } from '@/shared/events/enums/event-types';
import { publishSystemEvent, publishSimpleEvent } from '@/shared/events/event-publisher';
import { stripeTypeGuards } from '@/modules/onboarding/utils/stripeTypeGuards';

const normalizeExternalAccounts = (input: {
  externalAccounts: unknown;
}): ExternalAccounts => {
  const { externalAccounts } = input;
  if (stripeTypeGuards.isExternalAccountList(externalAccounts)) {
    return externalAccounts;
  }
  const data = stripeTypeGuards.isRecord(externalAccounts)
    ? Object.values(externalAccounts)
    : [];
  const normalizedData = data.filter(stripeTypeGuards.isExternalAccountItem);
  return { object: 'list', data: normalizedData };
};

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
    const accountType = externalAccount.object === 'bank_account'
      || externalAccount.object === 'card'
      ? externalAccount.object
      : 'unknown';
    console.log(
      `Processing external_account.deleted: ${externalAccount.id} (${accountType}) for account: ${externalAccount.account}`,
    );
    const stripeAccountId = typeof externalAccount.account === 'string'
      ? externalAccount.account
      : null;
    if (!stripeAccountId) {
      console.warn(`Missing Stripe account ID for external account: ${externalAccount.id}`);
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
        `Account not found for external account deletion: ${externalAccount.account}`,
      );
      return;
    }

    const currentAccount = account[0];

    const currentExternalAccounts = normalizeExternalAccounts({
      externalAccounts: currentAccount.externalAccounts,
    });

    const updatedExternalAccounts: ExternalAccounts = {
      object: 'list',
      data: currentExternalAccounts.data.filter((account) => account.id !== externalAccount.id),
    };

    // Update the account external accounts in the database
    await db
      .update(stripeConnectedAccounts)
      .set({
        externalAccounts: updatedExternalAccounts,
        last_refreshed_at: new Date(),
      })
      .where(
        eq(
          stripeConnectedAccounts.stripe_account_id,
          stripeAccountId,
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
