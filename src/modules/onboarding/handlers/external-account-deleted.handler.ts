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

const logger = getLogger(['onboarding', 'handler', 'external-account-deleted']);

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

    const stripeAccountId = typeof externalAccount.account === 'string'
      ? externalAccount.account
      : null;

    if (!stripeAccountId) {
      logger.warn("Missing Stripe account ID for external account: {externalAccountId}", { externalAccountId: externalAccount.id });
      return;
    }

    logger.debug(
      "Processing external_account.deleted: {externalAccountId} ({accountType}) for account: {stripeAccountId}",
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
        "Account not found for external account deletion: {stripeAccountId}",
        { stripeAccountId }
      );
      return;
    }

    const currentAccount = account[0];

    const currentExternalAccounts = normalizeExternalAccounts({
      externalAccounts: currentAccount.externalAccounts,
    });

    const updatedExternalAccounts: ExternalAccounts = {
      object: 'list',
      data: currentExternalAccounts.data.filter((acc: ExternalAccount) => acc.id !== externalAccount.id),
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

      // Publish external account deleted event within transaction
      await publishEventTx(tx, {
        type: EventType.ONBOARDING_EXTERNAL_ACCOUNT_DELETED,
        actorId: WEBHOOK_ACTOR_UUID,
        actorType: 'webhook',
        organizationId: currentAccount.organization_id,
        payload: {
          stripe_account_id: stripeAccountId,
          organization_id: currentAccount.organization_id,
          external_account_id: externalAccount.id,
          external_account_type: accountType,
          deleted_at: new Date().toISOString(),
        },
      });
    });

    logger.info(
      "External account deleted and event published for: {externalAccountId}",
      { externalAccountId: externalAccount.id }
    );
  } catch (error) {
    logger.error(
      "Failed to delete external account: {externalAccountId} {error}",
      { externalAccountId: externalAccount.id, error }
    );
    throw error;
  }
};
