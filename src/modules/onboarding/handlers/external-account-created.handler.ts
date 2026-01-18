import { getLogger } from '@logtape/logtape';
import { eq } from 'drizzle-orm';
import type Stripe from 'stripe';

import {
  stripeConnectedAccounts,
} from '@/modules/onboarding/schemas/onboarding.schema';
import type {
  ExternalAccount,
  ExternalAccounts,
} from '@/modules/onboarding/types/onboarding.types';
import { stripeTypeGuards } from '@/modules/onboarding/utils/stripeTypeGuards';
import { db } from '@/shared/database';
import { EventType } from '@/shared/events/enums/event-types';
import { publishEventTx, WEBHOOK_ACTOR_UUID } from '@/shared/events/event-publisher';

const logger = getLogger(['onboarding', 'handler', 'external-account-created']);

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

    const stripeAccountId = typeof externalAccount.account === 'string'
      ? externalAccount.account
      : null;

    if (!stripeAccountId) {
      logger.warn("Missing Stripe account ID for external account: {externalAccountId}", { externalAccountId: externalAccount.id });
      return;
    }

    logger.debug(
      "Processing external_account.created: {externalAccountId} ({accountType}) for account: {stripeAccountId}",
      { externalAccountId: externalAccount.id, accountType, stripeAccountId }
    );

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
      logger.warn(
        "Account not found for external account creation: {stripeAccountId}",
        { stripeAccountId }
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
            stripeAccountId,
          ),
        );

      // Publish external account created event within transaction
      await publishEventTx(tx, {
        type: EventType.ONBOARDING_EXTERNAL_ACCOUNT_CREATED,
        actorId: WEBHOOK_ACTOR_UUID,
        actorType: 'webhook',
        organizationId: currentAccount.organization_id,
        payload: {
          stripe_account_id: stripeAccountId,
          organization_id: currentAccount.organization_id,
          external_account_id: externalAccount.id,
          external_account_type: accountType,
          external_account_status: externalAccount.status,
          created_at: new Date().toISOString(),
        },
      });
    });

    logger.info(
      "External account created and event published for: {externalAccountId}",
      { externalAccountId: externalAccount.id }
    );
  } catch (error) {
    logger.error(
      "Failed to create external account: {externalAccountId} {error}",
      { externalAccountId: externalAccount.id, error }
    );
    throw error;
  }
};
