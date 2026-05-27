import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ForbiddenError } from '@casl/ability';
import type { Stripe } from 'stripe';

// ── Mock the repository and Stripe client so the service stays a pure unit ──
vi.mock('@/modules/payouts/database/queries/payouts.repository', () => ({
  payoutsRepository: {
    listByOrganization: vi.fn(),
    findByIdAndOrganization: vi.fn(),
    upsertByStripePayoutId: vi.fn(),
  },
}));

vi.mock('@/shared/utils/stripe-client', () => ({
  stripe: { balanceTransactions: { list: vi.fn() } },
  getStripeInstance: () => ({ balanceTransactions: { list: vi.fn() } }),
}));

import { payoutsRepository } from '@/modules/payouts/database/queries/payouts.repository';
import type { SelectPayout } from '@/modules/payouts/database/schema/payouts.schema';
import { payoutsService } from '@/modules/payouts/services/payouts.service';
import { defineAbilityFor } from '@/shared/auth/abilities';
import type { ServiceContext } from '@/shared/types/service-context';
import { stripe } from '@/shared/utils/stripe-client';

const listByOrgMock = vi.mocked(payoutsRepository.listByOrganization);
const findByIdMock = vi.mocked(payoutsRepository.findByIdAndOrganization);
const balanceTxnListMock = vi.mocked(stripe.balanceTransactions.list);

const ORG_ID = 'org_test_1';

const makeCtx = (role: string): ServiceContext =>
  ({ organizationId: ORG_ID, ability: defineAbilityFor(role) }) as unknown as ServiceContext;

const makePayoutRow = (overrides: Partial<SelectPayout> = {}): SelectPayout => ({
  id: 'pay_row_1',
  organization_id: ORG_ID,
  stripe_account_id: 'acct_test_123',
  stripe_payout_id: 'po_test_123',
  amount: 125000,
  currency: 'usd',
  status: 'paid',
  type: 'bank_account',
  method: 'standard',
  description: null,
  statement_descriptor: null,
  failure_code: null,
  failure_message: null,
  destination_id: 'ba_test_123',
  balance_transaction_id: 'txn_test_123',
  automatic: true,
  arrival_date: new Date('2026-05-01T00:00:00.000Z'),
  stripe_created_at: new Date('2026-04-30T00:00:00.000Z'),
  metadata: { foo: 'bar' },
  created_at: new Date('2026-04-30T01:00:00.000Z'),
  updated_at: new Date('2026-04-30T02:00:00.000Z'),
  ...overrides,
});

const makeBalanceTxn = (overrides: Partial<Stripe.BalanceTransaction> = {}): Stripe.BalanceTransaction =>
  ({
    id: 'txn_1',
    object: 'balance_transaction',
    type: 'charge',
    amount: 5000,
    fee: 175,
    net: 4825,
    currency: 'usd',
    description: 'Payment',
    source: 'ch_123',
    created: 1_699_800_000,
    ...overrides,
  }) as unknown as Stripe.BalanceTransaction;

const mockBalanceTransactions = (data: Stripe.BalanceTransaction[], hasMore = false): void => {
  balanceTxnListMock.mockResolvedValue({ data, has_more: hasMore } as unknown as Awaited<
    ReturnType<typeof balanceTxnListMock>
  >);
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('payoutsService.listPayouts', () => {
  it('returns an offset-paginated ledger of rows for a member', async () => {
    const row = makePayoutRow();
    listByOrgMock.mockResolvedValue({ payouts: [row], total: 1 });

    const result = await payoutsService.listPayouts({ filters: { page: 1, limit: 20 } }, makeCtx('member'));

    expect(listByOrgMock).toHaveBeenCalledWith(ORG_ID, { page: 1, limit: 20 });
    expect(result.pagination).toEqual({ page: 1, limit: 20, total: 1 });
    expect(result.data).toEqual([row]);
    // The service returns raw rows; the handler serializes via serializePaginatedPayouts.
    expect(result.data[0]?.stripe_created_at).toBeInstanceOf(Date);
  });

  it('forwards the status filter to the repository', async () => {
    listByOrgMock.mockResolvedValue({ payouts: [], total: 0 });

    await payoutsService.listPayouts({ filters: { status: 'failed', page: 2, limit: 50 } }, makeCtx('member'));

    expect(listByOrgMock).toHaveBeenCalledWith(ORG_ID, { status: 'failed', page: 2, limit: 50 });
  });

  it('denies clients (no read access to payouts)', async () => {
    await expect(payoutsService.listPayouts({ filters: { page: 1, limit: 20 } }, makeCtx('client'))).rejects.toThrow(
      ForbiddenError
    );
    expect(listByOrgMock).not.toHaveBeenCalled();
  });
});

describe('payoutsService.getPayoutDetail', () => {
  it('returns the payout with its settlement-batch transactions', async () => {
    findByIdMock.mockResolvedValue(makePayoutRow());
    mockBalanceTransactions(
      [makeBalanceTxn(), makeBalanceTxn({ id: 'txn_2', type: 'stripe_fee', source: null })],
      true
    );

    const result = await payoutsService.getPayoutDetail({ id: 'pay_row_1' }, makeCtx('member'));

    expect(findByIdMock).toHaveBeenCalledWith('pay_row_1', ORG_ID);
    expect(balanceTxnListMock).toHaveBeenCalledWith(
      { payout: 'po_test_123', limit: 100 },
      { stripeAccount: 'acct_test_123' }
    );
    expect(result.id).toBe('pay_row_1');
    expect(result.balance_transaction_id).toBe('txn_test_123');
    expect(result.metadata).toEqual({ foo: 'bar' });
    expect(result.transactions_has_more).toBe(true);
    expect(result.transactions).toHaveLength(2);
    expect(result.transactions[0]).toEqual({
      id: 'txn_1',
      type: 'charge',
      amount: 5000,
      fee: 175,
      net: 4825,
      currency: 'usd',
      description: 'Payment',
      source: 'ch_123',
      created: new Date(1_699_800_000 * 1000).toISOString(),
    });
    expect(result.transactions[1]?.source).toBeNull();
  });

  it('resolves an expanded balance-transaction source object to its id', async () => {
    findByIdMock.mockResolvedValue(makePayoutRow());
    mockBalanceTransactions([makeBalanceTxn({ source: { id: 'ch_expanded' } as Stripe.BalanceTransaction['source'] })]);

    const result = await payoutsService.getPayoutDetail({ id: 'pay_row_1' }, makeCtx('member'));

    expect(result.transactions[0]?.source).toBe('ch_expanded');
  });

  it('throws 404 when the payout does not exist for the practice', async () => {
    findByIdMock.mockResolvedValue(undefined);

    await expect(payoutsService.getPayoutDetail({ id: 'missing' }, makeCtx('member'))).rejects.toMatchObject({
      status: 404,
    });
    expect(balanceTxnListMock).not.toHaveBeenCalled();
  });

  it('throws 502 when Stripe fails to return the settlement transactions', async () => {
    findByIdMock.mockResolvedValue(makePayoutRow());
    balanceTxnListMock.mockRejectedValue(new Error('stripe down'));

    await expect(payoutsService.getPayoutDetail({ id: 'pay_row_1' }, makeCtx('member'))).rejects.toMatchObject({
      status: 502,
    });
  });

  it('denies clients (no read access to payouts)', async () => {
    await expect(payoutsService.getPayoutDetail({ id: 'pay_row_1' }, makeCtx('client'))).rejects.toThrow(
      ForbiddenError
    );
    expect(findByIdMock).not.toHaveBeenCalled();
  });
});
