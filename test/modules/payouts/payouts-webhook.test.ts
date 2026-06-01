import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Stripe } from 'stripe';

// ── Mock the DB-backed repositories so the webhook service stays a pure unit ──
vi.mock('@/modules/payouts/database/queries/payouts.repository', () => ({
  payoutsRepository: {
    upsertByStripePayoutId: vi.fn(),
    listByOrganization: vi.fn(),
    findByIdAndOrganization: vi.fn(),
  },
}));

vi.mock('@/modules/onboarding/database/queries/onboarding.repository', () => ({
  onboardingRepository: {
    findByStripeAccountId: vi.fn(),
  },
}));

import { payoutsRepository } from '@/modules/payouts/database/queries/payouts.repository';
import { onboardingRepository } from '@/modules/onboarding/database/queries/onboarding.repository';
import { payoutsWebhookService } from '@/modules/payouts/services/payouts.webhook.service';

const upsertMock = vi.mocked(payoutsRepository.upsertByStripePayoutId);
const findAccountMock = vi.mocked(onboardingRepository.findByStripeAccountId);

const ACCOUNT_ID = 'acct_test_123';
const ORG_ID = 'org_test_1';

const makePayout = (overrides: Partial<Stripe.Payout> = {}): Stripe.Payout =>
  ({
    id: 'po_test_123',
    object: 'payout',
    amount: 125000,
    currency: 'usd',
    status: 'paid',
    type: 'bank_account',
    method: 'standard',
    description: 'Weekly payout',
    statement_descriptor: 'BLAWBY',
    failure_code: null,
    failure_message: null,
    destination: 'ba_test_123',
    balance_transaction: 'txn_test_123',
    automatic: true,
    arrival_date: 1_700_000_000,
    created: 1_699_900_000,
    metadata: { foo: 'bar' },
    ...overrides,
  }) as unknown as Stripe.Payout;

// `account` defaults to a connected account; pass `null` to simulate a platform
// payout with no connected account (Stripe omits `event.account` in that case).
const makeEvent = (type: string, object: unknown, account: string | null = ACCOUNT_ID): Stripe.Event =>
  ({ id: 'evt_test_1', type, account: account ?? undefined, created: 1_699_800_000, data: { object } }) as unknown as Stripe.Event;

describe('payoutsWebhookService.processEvent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: the connected account resolves to an organization.
    findAccountMock.mockResolvedValue({ organization_id: ORG_ID } as Awaited<ReturnType<typeof findAccountMock>>);
  });

  it('ignores payout event types that are not handled', async () => {
    await payoutsWebhookService.processEvent(makeEvent('payout.reconciliation_completed', makePayout()));

    expect(findAccountMock).not.toHaveBeenCalled();
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('skips events whose object is not a payout', async () => {
    await payoutsWebhookService.processEvent(makeEvent('payout.paid', { object: 'charge', id: 'ch_1' }));

    expect(findAccountMock).not.toHaveBeenCalled();
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('skips payouts with no connected account on the event (platform payouts)', async () => {
    await payoutsWebhookService.processEvent(makeEvent('payout.paid', makePayout(), null));

    expect(findAccountMock).not.toHaveBeenCalled();
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('skips when no connected account is found for the Stripe account', async () => {
    findAccountMock.mockResolvedValue(null);

    await payoutsWebhookService.processEvent(makeEvent('payout.created', makePayout()));

    expect(findAccountMock).toHaveBeenCalledWith(ACCOUNT_ID);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('upserts a fully-mapped payout record for a handled event', async () => {
    await payoutsWebhookService.processEvent(makeEvent('payout.paid', makePayout()));

    expect(upsertMock).toHaveBeenCalledTimes(1);
    expect(upsertMock).toHaveBeenCalledWith({
      organization_id: ORG_ID,
      stripe_account_id: ACCOUNT_ID,
      stripe_payout_id: 'po_test_123',
      amount: 125000,
      currency: 'usd',
      status: 'paid',
      type: 'bank_account',
      method: 'standard',
      description: 'Weekly payout',
      statement_descriptor: 'BLAWBY',
      failure_code: null,
      failure_message: null,
      destination_id: 'ba_test_123',
      balance_transaction_id: 'txn_test_123',
      automatic: true,
      arrival_date: new Date(1_700_000_000 * 1000),
      stripe_created_at: new Date(1_699_900_000 * 1000),
      metadata: { foo: 'bar' },
      last_stripe_event_created_at: new Date(1_699_800_000 * 1000),
      last_stripe_event_id: 'evt_test_1',
    });
  });

  it('records failure details and status for a failed payout', async () => {
    await payoutsWebhookService.processEvent(
      makeEvent(
        'payout.failed',
        makePayout({
          status: 'failed',
          failure_code: 'account_closed',
          failure_message: 'The bank account has been closed',
          arrival_date: 1_700_500_000,
        })
      )
    );

    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'failed',
        failure_code: 'account_closed',
        failure_message: 'The bank account has been closed',
      })
    );
  });

  it('resolves destination and balance_transaction when they are expanded objects', async () => {
    await payoutsWebhookService.processEvent(
      makeEvent(
        'payout.updated',
        makePayout({
          destination: { id: 'ba_expanded' } as Stripe.Payout['destination'],
          balance_transaction: { id: 'txn_expanded' } as Stripe.Payout['balance_transaction'],
        })
      )
    );

    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        destination_id: 'ba_expanded',
        balance_transaction_id: 'txn_expanded',
      })
    );
  });

  it('stores a null arrival_date when Stripe has not set one yet', async () => {
    await payoutsWebhookService.processEvent(
      makeEvent('payout.created', makePayout({ status: 'pending', arrival_date: null as unknown as number }))
    );

    expect(upsertMock).toHaveBeenCalledWith(expect.objectContaining({ arrival_date: null, status: 'pending' }));
  });
});
