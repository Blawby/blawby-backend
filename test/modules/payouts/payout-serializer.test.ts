import { describe, it, expect } from 'vitest';
import type { SelectPayout } from '@/modules/payouts/database/schema/payouts.schema';
import { serializePayout, serializePaginatedPayouts } from '@/modules/payouts/serializers/payout.serializer';

const makePayoutRow = (overrides: Partial<SelectPayout> = {}): SelectPayout => ({
  id: 'pay_row_1',
  organization_id: 'org_test_1',
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

describe('serializePayout', () => {
  it('converts all date fields to ISO strings and passes through scalar fields', () => {
    const result = serializePayout(makePayoutRow());

    expect(result.arrival_date).toBe('2026-05-01T00:00:00.000Z');
    expect(result.stripe_created_at).toBe('2026-04-30T00:00:00.000Z');
    expect(result.created_at).toBe('2026-04-30T01:00:00.000Z');
    expect(result.updated_at).toBe('2026-04-30T02:00:00.000Z');
    expect(result.amount).toBe(125000);
    expect(result.status).toBe('paid');
    expect(result.stripe_payout_id).toBe('po_test_123');
  });

  it('serializes a null arrival_date as null', () => {
    const result = serializePayout(makePayoutRow({ arrival_date: null }));

    expect(result.arrival_date).toBeNull();
  });

  it('omits internal/detail-only fields from the ledger entry', () => {
    const result = serializePayout(makePayoutRow());

    expect(result).not.toHaveProperty('organization_id');
    expect(result).not.toHaveProperty('balance_transaction_id');
    expect(result).not.toHaveProperty('metadata');
  });
});

describe('serializePaginatedPayouts', () => {
  it('serializes every row and preserves pagination metadata', () => {
    const pagination = { page: 2, limit: 10, total: 42 };
    const result = serializePaginatedPayouts({ data: [makePayoutRow()], pagination });

    expect(result.pagination).toEqual(pagination);
    expect(result.data).toHaveLength(1);
    expect(result.data[0]?.stripe_created_at).toBe('2026-04-30T00:00:00.000Z');
  });
});
