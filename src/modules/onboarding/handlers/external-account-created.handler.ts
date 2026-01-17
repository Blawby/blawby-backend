import { eq } from 'drizzle-orm';
import type Stripe from 'stripe';

import {
  stripeConnectedAccounts,
  type ExternalAccount,
  ExternalAccounts,
} from '@/modules/onboarding/schemas/onboarding.schema';
import { stripeTypeGuards } from '@/modules/onboarding/utils/stripeTypeGuards';
import { db } from '@/shared/database';
import { EventType } from '@/shared/events/enums/event-types';
import { publishEventTx, WEBHOOK_ACTOR_UUID } from '@/shared/events/event-publisher';

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
 * Handle account.external_account.created webhook event
 *
 * Stores external account information (bank accounts, cards) in the database
 * and publishes an ONBOARDING_EXTERNAL_ACCOUNT_CREATED event.
 * This is a pure function that doesn't depend on FastifyInstance.
 */
export const handleExternalAccountCreated = async (
  externalAccount: Stripe.ExternalAccount,
): Promise<void> => {
  try {
    const accountType = externalAccount.object === 'bank_account'
      || externalAccount.object === 'card'
      ? externalAccount.object
      : 'unknown';
    console.log(
      `Processing external_account.created: ${externalAccount.id} (${accountType}) for account: ${externalAccount.account}`,
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
        `Account not found for external account creation: ${externalAccount.account}`,
      );
      return;
    }

    const currentAccount = account[0];

    const bankAccount = stripeTypeGuards.isBankAccount(externalAccount)
      ? externalAccount
      : undefined;
    const cardAccount = stripeTypeGuards.isCardAccount(externalAccount)
      ? externalAccount
      : undefined;
    const normalizedAccount: ExternalAccount = {
      id: externalAccount.id,
      object: externalAccount.object,
      account: stripeAccountId,
      account_holder_name: bankAccount?.account_holder_name || undefined,
      account_holder_type: bankAccount?.account_holder_type || undefined,
      bank_name: bankAccount?.bank_name ?? undefined,
      country: externalAccount.country ?? undefined,
      currency: externalAccount.currency ?? undefined,
      default_for_currency: externalAccount.default_for_currency ?? undefined,
      fingerprint: externalAccount.fingerprint ?? undefined,
      last_4: bankAccount?.last4 || cardAccount?.last4,
      metadata: externalAccount.metadata ?? undefined,
      routing_number: bankAccount?.routing_number ?? undefined,
      status: externalAccount.status ?? undefined,
    };
    const currentExternalAccounts = normalizeExternalAccounts({
      externalAccounts: currentAccount.externalAccounts,
    });
    const updatedExternalAccounts: ExternalAccounts = {
      object: 'list',
      data: [
        ...currentExternalAccounts.data.filter((account) => account.id !== externalAccount.id),
        normalizedAccount,
      ],
    };

    // Update the account external accounts in the database within transaction with event publishing
    await db.transaction(async (tx) => {
      await tx
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

      // Publish external account created event within transaction
      await publishEventTx(tx, {
        type: EventType.ONBOARDING_EXTERNAL_ACCOUNT_CREATED,
        actorId: WEBHOOK_ACTOR_UUID,
        actorType: 'webhook',
        organizationId: currentAccount.organization_id,
        payload: {
          stripe_account_id: externalAccount.account,
          organization_id: currentAccount.organization_id,
          external_account_id: externalAccount.id,
          external_account_type: accountType,
          external_account_status: externalAccount.status,
          created_at: new Date().toISOString(),
        },
      });
    });

    console.log(
      `External account created and event published for: ${externalAccount.id}`,
    );
  } catch (error) {
    console.error(
      `Failed to create external account: ${externalAccount.id}`,
      error,
    );
    throw error;
  }
};
