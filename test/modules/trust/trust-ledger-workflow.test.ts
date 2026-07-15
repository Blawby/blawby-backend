import { mattersQueries } from '@/modules/matters/database/queries/matters.queries';
import { trustTransactionsRepository } from '@/modules/trust/database/queries/trust-transactions.queries';
import { trustService } from '@/modules/trust/services/trust.service';
import { RetainerLowBalance } from '@/shared/events/definitions/matters';
import type { ServiceContext } from '@/shared/types/service-context';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const transaction = vi.hoisted(() => vi.fn(async (run: () => Promise<unknown>) => run()));
const execute = vi.hoisted(() => vi.fn());

vi.mock('@/shared/database/uow', () => ({
  getActiveTx: () => ({ execute }),
  uow: { transaction },
}));

vi.mock('@/modules/trust/database/queries/trust-transactions.queries', () => ({
  trustTransactionsRepository: {
    createTransaction: vi.fn(),
    getLatestBalanceForMatter: vi.fn(),
    getLatestBalanceByClient: vi.fn(),
    getLatestBalancePerClient: vi.fn(),
    listByOrg: vi.fn(),
  },
}));

vi.mock('@/modules/matters/database/queries/matters.queries', () => ({
  mattersQueries: {
    updateRetainerBalance: vi.fn(),
    findMatterById: vi.fn(),
  },
}));

const organizationId = '00000000-0000-4000-8000-000000000001';
const clientId = '00000000-0000-4000-8000-000000000002';
const matterId = '00000000-0000-4000-8000-000000000003';
const userId = '00000000-0000-4000-8000-000000000004';

const emit = vi.fn(async () => 'event-id');
const ctx = { organizationId, userId, emit } as unknown as ServiceContext;
const createdTransaction = { id: 'transaction-id' };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(trustTransactionsRepository.getLatestBalanceForMatter).mockResolvedValue({ balance: 100 });
  vi.mocked(trustTransactionsRepository.getLatestBalanceByClient).mockResolvedValue([
    { matter_id: matterId, balance: 150 },
  ]);
  vi.mocked(trustTransactionsRepository.createTransaction).mockResolvedValue(createdTransaction as never);
  vi.mocked(mattersQueries.findMatterById).mockResolvedValue({
    id: matterId,
    organization_id: organizationId,
    retainer_low_balance_threshold: 200,
  } as never);
});

describe('trust ledger workflow', () => {
  it('records a deposit, synchronizes the matter balance, and evaluates the threshold atomically', async () => {
    const result = await trustService.recordDeposit(
      {
        organizationId,
        clientId,
        matterId,
        amount: 50,
        createdBy: userId,
      },
      ctx
    );

    expect(result).toBe(createdTransaction);
    expect(trustTransactionsRepository.createTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        organization_id: organizationId,
        client_id: clientId,
        matter_id: matterId,
        amount: 50,
        balance_after: 150,
      })
    );
    expect(mattersQueries.updateRetainerBalance).toHaveBeenCalledWith(matterId, 150);
    expect(emit).toHaveBeenCalledWith(RetainerLowBalance, {
      matter_id: matterId,
      organization_id: organizationId,
      current_balance: 150,
      threshold: 200,
    });
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it('rejects a withdrawal that would overdraw before writing or synchronizing', async () => {
    await expect(
      trustService.recordWithdrawal(
        {
          organizationId,
          clientId,
          matterId,
          amount: 101,
          createdBy: userId,
        },
        ctx
      )
    ).rejects.toMatchObject({ status: 400 });

    expect(trustTransactionsRepository.createTransaction).not.toHaveBeenCalled();
    expect(mattersQueries.updateRetainerBalance).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });

  it('does not expose the raw transaction-scoped balance helper', () => {
    expect(trustService).not.toHaveProperty('getBalanceWithTx');
  });
});
