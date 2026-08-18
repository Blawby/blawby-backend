import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type Stripe from 'stripe';

import { handleAccountUpdated } from '@/modules/onboarding/handlers/account-updated.handler';
import { handleCapabilityUpdated } from '@/modules/onboarding/handlers/capability-updated.handler';
import { handleExternalAccountCreated } from '@/modules/onboarding/handlers/external-account-created.handler';

/**
 * Stripe can fire account.updated / capability.updated / account.external_account.created for a
 * newly-created connected account before Blawby's own createConnectedAccount request has
 * committed the local stripe_connected_accounts row. These handlers must throw (not silently
 * acknowledge) in that case so onboardingWebhooksService.processEvent's retry pipeline
 * (markFailed -> retryFailedWebhooks) tries again once the row exists, instead of permanently
 * dropping the update.
 */
describe('webhook-before-finalization recovery', () => {
  it('handleAccountUpdated throws (does not silently succeed) when the local account is not found yet', async () => {
    const account: Partial<Stripe.Account> = {
      id: `acct_${randomUUID()}`,
      charges_enabled: false,
      payouts_enabled: false,
      details_submitted: false,
      business_type: null,
      company: null,
      individual: null,
      requirements: null,
      capabilities: null,
      external_accounts: null,
      future_requirements: null,
      tos_acceptance: null,
      metadata: null,
    };

    // SAFETY: handleAccountUpdated only reads `account.id` before the not-found branch throws — this deliberately partial fixture never needs the rest of Stripe.Account.
    await expect(handleAccountUpdated(account as Stripe.Account)).rejects.toThrow(
      `Connected account not found for Stripe ID ${account.id}`
    );
  });

  it('handleCapabilityUpdated throws (does not silently succeed) when the local account is not found yet', async () => {
    const accountId = `acct_${randomUUID()}`;
    const capability: Partial<Stripe.Capability> = {
      id: 'card_payments',
      account: accountId,
      status: 'active',
      requested: true,
    };

    // SAFETY: handleCapabilityUpdated only reads `capability.account` before the not-found branch throws — this deliberately partial fixture never needs the rest of Stripe.Capability.
    await expect(handleCapabilityUpdated(capability as Stripe.Capability)).rejects.toThrow(
      `Connected account not found for Stripe ID ${accountId}`
    );
  });

  it('handleExternalAccountCreated throws (does not silently succeed) when the local account is not found yet', async () => {
    const accountId = `acct_${randomUUID()}`;
    const externalAccount: Partial<Stripe.ExternalAccount> = {
      id: `ba_${randomUUID()}`,
      object: 'bank_account',
      account: accountId,
      status: 'new',
    };

    // SAFETY: handleExternalAccountCreated only reads `externalAccount.account` before the not-found branch throws — this deliberately partial fixture never needs the rest of Stripe.ExternalAccount.
    await expect(handleExternalAccountCreated(externalAccount as Stripe.ExternalAccount)).rejects.toThrow(
      `Connected account not found for Stripe ID ${accountId}`
    );
  });
});
