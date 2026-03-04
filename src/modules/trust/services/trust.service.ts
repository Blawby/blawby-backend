import { getLogger } from '@logtape/logtape';
import { sql } from 'drizzle-orm';
import { trustTransactionsRepository } from '@/modules/trust/database/queries/trust-transactions.queries';
import { result } from '@/shared/utils/result';
import { db } from '@/shared/database';

import type { SelectTrustTransaction } from '@/modules/trust/database/schema/trust-transactions.schema';
import type { Result } from '@/shared/types/result';

const logger = getLogger(['trust', 'service']);

export type RecordDepositParams = {
  organizationId: string;
  clientId: string;
  matterId?: string | null;
  amount: number;
  invoiceId?: string | null;
  stripePaymentIntentId?: string | null;
  description?: string;
  createdBy: string;
};

/**
 * Shared helper to acquire a trust lock and execute logic with retries for serialization failures.
 */
const withTrustLock = async <T>(
  params: { organizationId: string; clientId: string; matterId?: string | null },
  execute: (trx: typeof db) => Promise<Result<T>>,
  tx?: Parameters<typeof trustTransactionsRepository.createTransaction>[1]
): Promise<Result<T>> => {
  let retries = 3;

  const runWithLock = async (trx: typeof db) => {
    const lockKeyBuffer = `${params.organizationId}:${params.clientId}:${params.matterId ?? 'no-matter'}`;
    await trx.execute(sql`SET LOCAL lock_timeout = '5s'`);
    await trx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${lockKeyBuffer}))`);
    return await execute(trx);
  };

  while (true) {
    try {
      return tx ? await runWithLock(tx) : await db.transaction(runWithLock);
    } catch (error: unknown) {
      const code = error && typeof error === 'object' && 'code' in error ? (error as { code: string }).code : null;
      
      // Handle lock timeout
      if (code === '55P03') {
        logger.warn('Trust operation timed out waiting for lock: {error}', {
          error: error instanceof Error ? error.message : 'Timeout',
          params,
        });
        return result.conflict('Operation timed out due to high concurrency. Please try again.');
      }

      // Handle serialization failure - only retry if we are managing the transaction
      const isSerializationFailure = code === '40001';
      if (isSerializationFailure && !tx && retries > 0) {
        retries--;
        const delay = 100 * (2 ** (3 - retries));
        logger.info('Retrying trust transaction due to serialization failure (retries left: {retries})', { retries });
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }

      throw error;
    }
  }
};

/**
 * Record a trust deposit (e.g., retainer payment received).
 */
const recordDeposit = async (
  params: RecordDepositParams,
  tx?: Parameters<typeof trustTransactionsRepository.createTransaction>[1]
): Promise<Result<SelectTrustTransaction>> => {
  if (params.amount <= 0) return result.badRequest('Amount must be positive');

  try {
    return await withTrustLock(params, async (trx) => {
      const balanceRow = await trustTransactionsRepository.getLatestBalanceForMatter(
        params.organizationId,
        params.clientId,
        params.matterId ?? null,
        trx,
      );
      const currentBalance = balanceRow?.balance ?? 0;
      const newBalance = currentBalance + params.amount;

      const record = await trustTransactionsRepository.createTransaction({
        organization_id: params.organizationId,
        client_id: params.clientId,
        matter_id: params.matterId ?? null,
        transaction_type: 'deposit',
        amount: params.amount,
        balance_after: newBalance,
        description: params.description ?? 'Retainer deposit',
        source: 'retainer_invoice',
        invoice_id: params.invoiceId ?? null,
        stripe_payment_intent_id: params.stripePaymentIntentId ?? null,
        created_by: params.createdBy,
      }, trx);
      return result.ok(record);
    }, tx);
  } catch (error) {
    logger.error('Failed to record trust deposit: {error}', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return result.internalError('Failed to record trust deposit');
  }
};

export type RecordWithdrawalParams = {
  organizationId: string;
  clientId: string;
  matterId?: string | null;
  amount: number;
  invoiceId?: string | null;
  stripePaymentIntentId?: string | null;
  description?: string;
  createdBy: string;
};

/**
 * Record a trust withdrawal (e.g., invoice paid from retainer).
 */
const recordWithdrawal = async (
  params: RecordWithdrawalParams,
  tx?: Parameters<typeof trustTransactionsRepository.createTransaction>[1]
): Promise<Result<SelectTrustTransaction>> => {
  if (params.amount <= 0) return result.badRequest('Amount must be positive');

  try {
    return await withTrustLock(params, async (trx) => {
      const balanceRow = await trustTransactionsRepository.getLatestBalanceForMatter(
        params.organizationId,
        params.clientId,
        params.matterId ?? null,
        trx,
      );
      const currentBalance = balanceRow?.balance ?? 0;
      
      if (currentBalance < params.amount) {
        return result.badRequest('Insufficient funds');
      }
      
      const newBalance = currentBalance - params.amount;

      const record = await trustTransactionsRepository.createTransaction({
        organization_id: params.organizationId,
        client_id: params.clientId,
        matter_id: params.matterId ?? null,
        transaction_type: 'withdrawal',
        amount: params.amount,
        balance_after: newBalance,
        description: params.description ?? 'Invoice payment from retainer',
        source: 'invoice_payment',
        invoice_id: params.invoiceId ?? null,
        stripe_payment_intent_id: params.stripePaymentIntentId ?? null,
        created_by: params.createdBy,
      }, trx);
      return result.ok(record);
    }, tx);
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
const getTransactions = async (params: {
  organizationId: string;
  clientId?: string;
  matterId?: string;
  startDate?: Date;
  endDate?: Date;
}): Promise<Result<SelectTrustTransaction[]>> => {
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
const getBalance = async (params: {
  organizationId: string;
  clientId: string;
}): Promise<Result<{ total: number; byMatter: { matter_id: string | null; balance: number }[] }>> => {
  try {
    const rows = await trustTransactionsRepository.getLatestBalanceByClient(
      params.organizationId,
      params.clientId,
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
const getReport = async (params: {
  organizationId: string;
  startDate?: Date;
  endDate?: Date;
}): Promise<Result<SelectTrustTransaction[]>> => {
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

export const trustService = {
  recordDeposit,
  recordWithdrawal,
  getTransactions,
  getBalance,
  getReport,
};
