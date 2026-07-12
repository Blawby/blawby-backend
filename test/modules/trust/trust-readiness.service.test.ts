import {
  buildRetainerTargets,
  calculateReconciliation,
  ensureIdempotentMatch,
  getLedgerSnapshot,
} from '@/modules/trust/services/trust-readiness.service';
import { describe, expect, it } from 'vitest';

const balances = [
  {
    client_id: 'client-1',
    matter_id: 'matter-1',
    balance: 8_000,
    as_of_date: new Date('2026-07-10T00:00:00Z'),
  },
  {
    client_id: 'client-2',
    matter_id: 'matter-2',
    balance: 2_000,
    as_of_date: new Date('2026-07-11T00:00:00Z'),
  },
];

describe('trust readiness rules', () => {
  it('calculates both sides of a balanced three-way reconciliation', () => {
    expect(
      calculateReconciliation({ bankStatementBalance: 10_000, trustBookBalance: 10_000, clientLedgerBalance: 10_000 })
    ).toEqual({ bankToBookVariance: 0, bookToClientVariance: 0, status: 'balanced' });
  });

  it('preserves signed bank-to-book and book-to-client variances', () => {
    expect(
      calculateReconciliation({ bankStatementBalance: 11_000, trustBookBalance: 10_000, clientLedgerBalance: 9_500 })
    ).toEqual({ bankToBookVariance: 1_000, bookToClientVariance: 500, status: 'variance' });
  });

  it('builds an exact client-ledger snapshot from latest client/matter balances', () => {
    expect(getLedgerSnapshot(balances)).toEqual({
      clientLedgerBalance: 10_000,
      asOfAt: new Date('2026-07-11T00:00:00Z'),
    });
  });

  it('uses matter retainer caps as targets without invoice or operating-account totals', () => {
    expect(
      buildRetainerTargets(
        [
          { client_id: 'client-1', matter_id: 'matter-1', target_balance: 10_000 },
          { client_id: 'client-2', matter_id: 'matter-2', target_balance: 2_000 },
        ],
        balances
      )
    ).toEqual([
      {
        client_id: 'client-1',
        matter_id: 'matter-1',
        current_balance: 8_000,
        target_balance: 10_000,
        funded_percent: 80,
        status: 'low',
      },
      {
        client_id: 'client-2',
        matter_id: 'matter-2',
        current_balance: 2_000,
        target_balance: 2_000,
        funded_percent: 100,
        status: 'funded',
      },
    ]);
  });

  it('rejects reuse of an idempotency key with different statement inputs', () => {
    const row = {
      id: '11111111-1111-4111-8111-111111111111',
      organization_id: '22222222-2222-4222-8222-222222222222',
      idempotency_key: '33333333-3333-4333-8333-333333333333',
      statement_ending_at: new Date('2026-06-30T23:59:59Z'),
      bank_statement_balance: 10_000,
      trust_book_balance: 10_000,
      client_ledger_balance: 10_000,
      bank_to_book_variance: 0,
      book_to_client_variance: 0,
      status: 'balanced',
      source: 'manual_statement',
      notes: null,
      created_by: '44444444-4444-4444-8444-444444444444',
      created_at: new Date('2026-07-01T00:00:00Z'),
    };
    const input = {
      idempotency_key: row.idempotency_key,
      statement_ending_at: row.statement_ending_at.toISOString(),
      bank_statement_balance: row.bank_statement_balance,
      trust_book_balance: row.trust_book_balance,
    };

    expect(() => ensureIdempotentMatch(row, input)).not.toThrow();
    expect(() => ensureIdempotentMatch(row, { ...input, trust_book_balance: 9_999 })).toThrow(
      'Idempotency key was already used for a different reconciliation'
    );
  });
});
