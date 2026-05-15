import { getLogger } from '@logtape/logtape';
import { ForbiddenError } from '@casl/ability';
import { HTTPException } from 'hono/http-exception';
import { sql } from 'drizzle-orm';
import { trustTransactionsRepository } from '@/modules/trust/database/queries/trust-transactions.queries';
import { db } from '@/shared/database';
import type { SelectTrustTransaction } from '@/modules/trust/database/schema/trust-transactions.schema';
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

/**
 * Shared helper to acquire a trust lock and execute logic with retries for serialization failures.
 */
const withTrustLock = async <T>(
  params: { organizationId: string; clientId: string; matterId?: string | null },
  execute: (trx: typeof db) => Promise<T>,
  tx?: typeof db
): Promise<T> => {
  const lockKey = `${params.organizationId}:${params.clientId}:${params.matterId ?? 'no-matter'}`;

  const runWithLock = async (trx: typeof db): Promise<T> => {
    await trx.execute(sql`SET LOCAL lock_timeout = '5s'`);
    await trx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`);
    return execute(trx);
  };

  const run = async (attempt: number): Promise<T> => {
    try {
      return tx ? await runWithLock(tx) : await db.transaction(runWithLock);
    } catch (error: unknown) {
      const code = error && typeof error === 'object' && 'code' in error ? error.code : null;

      if (code === '55P03') {
        logger.warn('Trust lock timed out waiting for advisory lock', { lockKey });
        throw new HTTPException(409, { message: 'Operation timed out due to high concurrency. Please try again.' });
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
): Promise<SelectTrustTransaction> => {
  if (params.amount <= 0) {
    throw new HTTPException(400, { message: 'Amount must be positive' });
  }

  return withTrustLock(
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

      return trustTransactionsRepository.createTransaction(
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
    },
    tx
  );
};

/**
 * Record a trust withdrawal (e.g., invoice paid from retainer).
 */
const recordWithdrawal = async (
  params: RecordWithdrawalParams,
  tx?: Parameters<typeof trustTransactionsRepository.createTransaction>[1]
): Promise<SelectTrustTransaction> => {
  if (params.amount <= 0) {
    throw new HTTPException(400, { message: 'Amount must be positive' });
  }

  return withTrustLock(
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
        throw new HTTPException(400, { message: 'Insufficient funds' });
      }

      const newBalance = currentBalance - params.amount;

      return trustTransactionsRepository.createTransaction(
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
    },
    tx
  );
};

/**
 * Get trust transaction history filtered by client and/or matter.
 */
const getTransactions = async (
  params: GetTransactionsParams,
  ctx: ServiceContext
): Promise<SelectTrustTransaction[]> => {
  ForbiddenError.from(ctx.ability).throwUnlessCan('read', 'Trust');
  return trustTransactionsRepository.listByOrg(params);
};

/**
 * Get current trust balance per client (sum of all matter balances).
 */
const getBalance = async (
  params: GetBalanceParams,
  ctx: ServiceContext
): Promise<{ total: number; byMatter: { matter_id: string | null; balance: number }[] }> => {
  ForbiddenError.from(ctx.ability).throwUnlessCan('read', 'Trust');
  return getBalanceWithTx(params);
};

const getBalanceWithTx = async (
  params: GetBalanceParams,
  tx?: typeof db
): Promise<{ total: number; byMatter: { matter_id: string | null; balance: number }[] }> => {
  const rows = await trustTransactionsRepository.getLatestBalanceByClient(params.organizationId, params.clientId, tx);
  const total = rows.reduce((sum, r) => sum + r.balance, 0);
  return { total, byMatter: rows };
};

/**
 * Get trust report for IOLTA compliance over a date range.
 */
const getReport = async (params: GetReportParams, ctx: ServiceContext): Promise<SelectTrustTransaction[]> => {
  ForbiddenError.from(ctx.ability).throwUnlessCan('read', 'Trust');
  return trustTransactionsRepository.listByOrg(params);
};

/**
 * Get the latest trust balance per client across the organization.
 */
const getClientBalances = async (
  _params: Record<string, never>,
  ctx: ServiceContext
): Promise<{ client_id: string; balance: number; as_of_date: Date }[]> => {
  ForbiddenError.from(ctx.ability).throwUnlessCan('read', 'Trust');
  return trustTransactionsRepository.getLatestBalancePerClient(ctx.organizationId);
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
  const balance = await getBalanceWithTx({ organizationId, clientId }, tx);
  const matterBalance = balance.byMatter.find((m) => m.matter_id === matterId)?.balance ?? 0;
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
): Promise<SelectTrustTransaction> => {
  ForbiddenError.from(ctx.ability).throwUnlessCan('manage', 'Trust');

  return db.transaction(async (tx) => {
    const record = await recordDeposit(
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

    await syncBalanceAndCheckThreshold(data.matter_id, ctx.organizationId, data.client_id, ctx, tx);
    return record;
  });
};

/**
 * Manual trust withdrawal (staff-initiated). Records in ledger, syncs retainer_balance, checks threshold.
 * Rejects if balance would go below 0.
 */
const manualWithdrawal = async (
  { data }: { data: ManualTrustData },
  ctx: ServiceContext
): Promise<SelectTrustTransaction> => {
  ForbiddenError.from(ctx.ability).throwUnlessCan('manage', 'Trust');

  return db.transaction(async (tx) => {
    const record = await recordWithdrawal(
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

    await syncBalanceAndCheckThreshold(data.matter_id, ctx.organizationId, data.client_id, ctx, tx);
    return record;
  });
};

export const trustService = {
  recordDeposit,
  recordWithdrawal,
  manualDeposit,
  manualWithdrawal,
  getTransactions,
  getBalance,
  getBalanceWithTx,
  getReport,
  getClientBalances,
};
