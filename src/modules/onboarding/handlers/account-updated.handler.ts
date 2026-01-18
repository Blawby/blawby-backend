import { getLogger } from '@logtape/logtape';
import { eq } from 'drizzle-orm';
import type Stripe from 'stripe';
import {
  stripeConnectedAccounts,
} from '@/modules/onboarding/schemas/onboarding.schema';
import { stripeAccountNormalizers } from '@/modules/onboarding/utils/stripeAccountNormalizers';
import { db } from '@/shared/database';
import { EventType } from '@/shared/events/enums/event-types';
import { publishEventTx } from '@/shared/events/event-publisher';
import { WEBHOOK_ACTOR_UUID } from '@/shared/events/constants';

const logger = getLogger(['onboarding', 'handler', 'account-updated']);

/**
 * Handle account.updated webhook event
 *
 * Updates the connected account record in the database with latest status
 * and publishes an ONBOARDING_ACCOUNT_UPDATED event.
 * Optimized to use .returning() to avoid redundant SELECT.
 */
export const handleAccountUpdated = async (
  account: Stripe.Account,
): Promise<void> => {
  try {
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

    // Update and get organization_id in one go
    let organizationId: string | undefined;

    await db.transaction(async (tx) => {
      const [updatedRecord] = await tx
        .update(stripeConnectedAccounts)
        .set(updateData)
        .where(eq(stripeConnectedAccounts.stripe_account_id, account.id))
        .returning({ organization_id: stripeConnectedAccounts.organization_id });

      if (!updatedRecord) {
        logger.warn("Account not found for Stripe ID: {stripeAccountId}, skipping update.", { stripeAccountId: account.id });
        return;
      }

      organizationId = updatedRecord.organization_id;

      // Publish account updated event within transaction
      await publishEventTx(tx, {
        type: EventType.ONBOARDING_ACCOUNT_UPDATED,
        actorId: WEBHOOK_ACTOR_UUID,
        actorType: 'webhook',
        organizationId: organizationId,
        payload: {
          stripe_account_id: account.id,
          organization_id: organizationId,
          charges_enabled: account.charges_enabled,
          payouts_enabled: account.payouts_enabled,
          details_submitted: account.details_submitted,
          business_type: account.business_type,
          updated_at: new Date().toISOString(),
        },
      });
    });

    if (organizationId) {
      logger.info("Account updated and event published for: {stripeAccountId}", { stripeAccountId: account.id });
    }
  } catch (error) {
    logger.error("Failed to update account: {stripeAccountId} {error}", { stripeAccountId: account.id, error });
    throw error;
  }
};
