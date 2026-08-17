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
    const account = {
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
    } as unknown as Stripe.Account;

    await expect(handleAccountUpdated(account)).rejects.toThrow();
  });

  it('handleCapabilityUpdated throws (does not silently succeed) when the local account is not found yet', async () => {
    const capability = {
      id: 'card_payments',
      account: `acct_${randomUUID()}`,
      status: 'active',
      requested: true,
    } as unknown as Stripe.Capability;

    await expect(handleCapabilityUpdated(capability)).rejects.toThrow();
  });

  it('handleExternalAccountCreated throws (does not silently succeed) when the local account is not found yet', async () => {
    const externalAccount = {
      id: `ba_${randomUUID()}`,
      object: 'bank_account',
      account: `acct_${randomUUID()}`,
      status: 'new',
    } as unknown as Stripe.ExternalAccount;

    await expect(handleExternalAccountCreated(externalAccount)).rejects.toThrow();
  });
});
