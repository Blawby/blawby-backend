import { getLogger } from '@logtape/logtape';
import { ForbiddenError } from '@casl/ability';
import { sql } from 'drizzle-orm';
import { trustTransactionsRepository } from '@/modules/trust/database/queries/trust-transactions.queries';
import { result } from '@/shared/utils/result';
import { db } from '@/shared/database';
import type { SelectTrustTransaction } from '@/modules/trust/database/schema/trust-transactions.schema';
import type { Result } from '@/shared/types/result';
import { mattersQueries } from '@/modules/matters/database/queries/matters.queries';
import { RetainerLowBalance } from '@/shared/events/definitions/matters';
import type { ServiceContext } from '@/shared/types/service-context';
import {
  type RecordDepositParams,
  type RecordWithdrawalParams,
  type GetTransactionsParams,
  type GetBalanceParams,
  type GetReportParams,
} from '@/modules/trust/types/trust.types';

const logger = getLogger(['trust', 'service']);

const isServiceContext = (value: unknown): value is ServiceContext =>
  value !== null && typeof value === 'object' && 'ability' in value && 'emit' in value && 'organizationId' in value;

const assertTrustManageAccess = (ctx: ServiceContext): void => {
  ForbiddenError.from(ctx.ability).throwUnlessCan('manage', 'Trust');
};

const assertTrustReadAccess = (ctx: ServiceContext): void => {
  ForbiddenError.from(ctx.ability).throwUnlessCan('read', 'Trust');
};

/**
 * Shared helper to acquire a trust lock and execute logic with retries for serialization failures.
 */
const withTrustLock = async <T>(
  params: { organizationId: string; clientId: string; matterId?: string | null },
  execute: (trx: typeof db) => Promise<Result<T>>,
  tx?: typeof db
): Promise<Result<T>> => {
  const lockKey = `${params.organizationId}:${params.clientId}:${params.matterId ?? 'no-matter'}`;

  const runWithLock = async (trx: typeof db): Promise<Result<T>> => {
    await trx.execute(sql`SET LOCAL lock_timeout = '5s'`);
    await trx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`);
    return execute(trx);
  };

  const run = async (attempt: number): Promise<Result<T>> => {
    try {
      return tx ? await runWithLock(tx) : await db.transaction(runWithLock);
    } catch (error: unknown) {
      const code = error && typeof error === 'object' && 'code' in error ? error.code : null;

      if (code === '55P03') {
        logger.warn('Trust lock timed out waiting for advisory lock', { lockKey });
        return result.conflict('Operation timed out due to high concurrency. Please try again.');
      }

      const canRetry = code === '40001' && !tx && attempt <= 3;
      if (!canRetry) {
        throw error;
      }

      const delay = 100 * 2 ** attempt; // 200ms → 400ms → 800ms
      logger.info('Retrying trust transaction after serialization failure (attempt {attempt}/3)', { attempt });
      await new Promise((r) => setTimeout(r, delay));
      return run(attempt + 1);
    }
  };

  return run(1);
};

/**
 * Record a trust deposit (e.g., retainer payment received).
 */
const recordDeposit = async (
  params: RecordDepositParams,
  tx?: Parameters<typeof trustTransactionsRepository.createTransaction>[1]
): Promise<Result<SelectTrustTransaction>> => {
  if (params.amount <= 0) {
    return result.badRequest('Amount must be positive');
  }

  try {
    return await withTrustLock(
      params,
      async (trx) => {
        const balanceRow = await trustTransactionsRepository.getLatestBalanceForMatter(
          params.organizationId,
          params.clientId,
          params.matterId ?? null,
          trx
        );
        const currentBalance = balanceRow?.balance ?? 0;
        const newBalance = currentBalance + params.amount;

        const record = await trustTransactionsRepository.createTransaction(
          {
            organization_id: params.organizationId,
            client_id: params.clientId,
            matter_id: params.matterId ?? null,
            transaction_type: 'deposit',
            amount: params.amount,
            balance_after: newBalance,
            description: params.description ?? 'Retainer deposit',
            source: params.source ?? 'retainer_invoice',
            invoice_id: params.invoiceId ?? null,
            stripe_payment_intent_id: params.stripePaymentIntentId ?? null,
            created_by: params.createdBy,
          },
          trx
        );
        return result.ok(record);
      },
      tx
    );
  } catch (error) {
    logger.error('Failed to record trust deposit: {error}', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return result.internalError('Failed to record trust deposit');
  }
};

/**
 * Record a trust withdrawal (e.g., invoice paid from retainer).
 */
const recordWithdrawal = async (
  params: RecordWithdrawalParams,
  tx?: Parameters<typeof trustTransactionsRepository.createTransaction>[1]
): Promise<Result<SelectTrustTransaction>> => {
  if (params.amount <= 0) {
    return result.badRequest('Amount must be positive');
  }

  try {
    return await withTrustLock(
      params,
      async (trx) => {
        const balanceRow = await trustTransactionsRepository.getLatestBalanceForMatter(
          params.organizationId,
          params.clientId,
          params.matterId ?? null,
          trx
        );
        const currentBalance = balanceRow?.balance ?? 0;

        if (currentBalance < params.amount) {
          return result.badRequest('Insufficient funds');
        }

        const newBalance = currentBalance - params.amount;

        const record = await trustTransactionsRepository.createTransaction(
          {
            organization_id: params.organizationId,
            client_id: params.clientId,
            matter_id: params.matterId ?? null,
            transaction_type: 'withdrawal',
            amount: params.amount,
            balance_after: newBalance,
            description: params.description ?? 'Invoice payment from retainer',
            source: params.source ?? 'invoice_payment',
            invoice_id: params.invoiceId ?? null,
            stripe_payment_intent_id: params.stripePaymentIntentId ?? null,
            created_by: params.createdBy,
          },
          trx
        );
        return result.ok(record);
      },
      tx
    );
  } catch (error) {
    logger.error('Failed to record trust withdrawal: {error}', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return result.internalError('Failed to record trust withdrawal');
  }
};

/**
 * Get trust transaction history filtered by client and/or matter.
 */
const getTransactions = async (
  params: GetTransactionsParams,
  ctx?: ServiceContext
): Promise<Result<SelectTrustTransaction[]>> => {
  if (ctx) {
    assertTrustReadAccess(ctx);
  }

  try {
    const txs = await trustTransactionsRepository.listByOrg(params);
    return result.ok(txs);
  } catch (error) {
    logger.error('Failed to list trust transactions: {error}', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return result.internalError('Failed to list trust transactions');
  }
};

/**
 * Get current trust balance per client (sum of all matter balances).
 */
const getBalance = async (
  params: GetBalanceParams,
  ctxOrTx?: ServiceContext | typeof db,
  tx?: typeof db
): Promise<Result<{ total: number; byMatter: { matter_id: string | null; balance: number }[] }>> => {
  const ctx = isServiceContext(ctxOrTx) ? ctxOrTx : undefined;
  const actualTx = isServiceContext(ctxOrTx) ? tx : ctxOrTx;

  if (ctx) {
    assertTrustReadAccess(ctx);
  }

  try {
    const rows = await trustTransactionsRepository.getLatestBalanceByClient(
      params.organizationId,
      params.clientId,
      actualTx
    );
    const total = rows.reduce((sum, r) => sum + r.balance, 0);
    return result.ok({ total, byMatter: rows });
  } catch (error) {
    logger.error('Failed to get trust balance: {error}', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return result.internalError('Failed to get trust balance');
  }
};

/**
 * Get trust report for IOLTA compliance over a date range.
 */
const getReport = async (params: GetReportParams, ctx?: ServiceContext): Promise<Result<SelectTrustTransaction[]>> => {
  if (ctx) {
    assertTrustReadAccess(ctx);
  }

  try {
    const txs = await trustTransactionsRepository.listByOrg(params);
    return result.ok(txs);
  } catch (error) {
    logger.error('Failed to generate trust report: {error}', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return result.internalError('Failed to generate trust report');
  }
};

interface ManualTrustData {
  matter_id: string;
  client_id: string;
  amount: number;
  description?: string;
}

const syncBalanceAndCheckThreshold = async (
  matterId: string,
  organizationId: string,
  clientId: string,
  ctx: ServiceContext,
  tx: typeof db
) => {
  const balanceResult = await getBalance({ organizationId, clientId }, tx);
  if (!balanceResult.success) {
    logger.warn('Failed to sync balance for matter {matterId}: {error}', {
      matterId,
      error: balanceResult.error.message,
    });
    return;
  }

  const matterBalance = balanceResult.data.byMatter.find((m) => m.matter_id === matterId)?.balance ?? 0;
  await mattersQueries.updateRetainerBalance(matterId, matterBalance, tx);

  const matter = await mattersQueries.findMatterById(matterId, tx);
  if (
    matter?.retainer_low_balance_threshold !== null &&
    matter?.retainer_low_balance_threshold !== undefined &&
    matter.retainer_low_balance_threshold > 0 &&
    matterBalance < matter.retainer_low_balance_threshold
  ) {
    await ctx.emit(
      RetainerLowBalance,
      {
        matter_id: matter.id,
        organization_id: matter.organization_id,
        current_balance: matterBalance,
        threshold: matter.retainer_low_balance_threshold,
      },
      tx
    );
  }
};

/**
 * Manual trust deposit (staff-initiated). Records in ledger, syncs retainer_balance, checks threshold.
 */
const manualDeposit = async (
  { data }: { data: ManualTrustData },
  ctx: ServiceContext
): Promise<Result<SelectTrustTransaction>> => {
  assertTrustManageAccess(ctx);

  return db.transaction(async (tx) => {
    const depositResult = await recordDeposit(
      {
        organizationId: ctx.organizationId,
        clientId: data.client_id,
        matterId: data.matter_id,
        amount: data.amount,
        description: data.description ?? 'Manual trust deposit',
        source: 'manual',
        createdBy: ctx.userId,
      },
      tx
    );

    if (!depositResult.success) {
      return depositResult;
    }

    await syncBalanceAndCheckThreshold(data.matter_id, ctx.organizationId, data.client_id, ctx, tx);
    return depositResult;
  });
};

/**
 * Manual trust withdrawal (staff-initiated). Records in ledger, syncs retainer_balance, checks threshold.
 * Rejects if balance would go below 0.
 */
const manualWithdrawal = async (
  { data }: { data: ManualTrustData },
  ctx: ServiceContext
): Promise<Result<SelectTrustTransaction>> => {
  assertTrustManageAccess(ctx);

  return db.transaction(async (tx) => {
    const withdrawalResult = await recordWithdrawal(
      {
        organizationId: ctx.organizationId,
        clientId: data.client_id,
        matterId: data.matter_id,
        amount: data.amount,
        description: data.description ?? 'Manual trust withdrawal',
        source: 'manual',
        createdBy: ctx.userId,
      },
      tx
    );

    if (!withdrawalResult.success) {
      return withdrawalResult;
    }

    await syncBalanceAndCheckThreshold(data.matter_id, ctx.organizationId, data.client_id, ctx, tx);
    return withdrawalResult;
  });
};

export const trustService = {
  recordDeposit,
  recordWithdrawal,
  manualDeposit,
  manualWithdrawal,
  getTransactions,
  getBalance,
  getReport,
};
