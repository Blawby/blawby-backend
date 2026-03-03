import { getLogger } from '@logtape/logtape';
import { trustTransactionsRepository } from '@/modules/trust/database/queries/trust-transactions.queries';
import type { InsertTrustTransaction, SelectTrustTransaction } from '@/modules/trust/database/schema/trust-transactions.schema';
import type { Result } from '@/shared/types/result';
import { result } from '@/shared/utils/result';
import { db } from '@/shared/database';

const logger = getLogger(['trust', 'service']);

/**
 * Record a trust deposit (e.g., retainer payment received).
 */
const recordDeposit = async (params: {
  organizationId: string;
  clientId: string;
  matterId?: string | null;
  amount: number;
  invoiceId?: string | null;
  stripePaymentIntentId?: string | null;
  description?: string;
  createdBy: string;
}, tx?: Parameters<typeof trustTransactionsRepository.createTransaction>[1]): Promise<Result<SelectTrustTransaction>> => {
  if (params.amount <= 0) return result.badRequest('Amount must be positive');

  const execute = async (trx: typeof db) => {
    let retries = 3;
    while (retries > 0) {
      try {
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
        } as InsertTrustTransaction, trx);
        return result.ok(record);
      } catch (error: any) {
        // Simple optimistic retry logic on serialization / locked row failures
        if (error?.code === '40001' /* serialization failure */ || retries === 1) {
          retries--;
          if (retries === 0) throw error;
        } else {
          throw error;
        }
      }
    }
    return result.internalError('Failed to record trust deposit');
  };

  try {
    return tx ? await execute(tx) : await db.transaction(execute);
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
const recordWithdrawal = async (params: {
  organizationId: string;
  clientId: string;
  matterId?: string | null;
  amount: number;
  invoiceId?: string | null;
  stripePaymentIntentId?: string | null;
  description?: string;
  createdBy: string;
}, tx?: Parameters<typeof trustTransactionsRepository.createTransaction>[1]): Promise<Result<SelectTrustTransaction>> => {
  if (params.amount <= 0) return result.badRequest('Amount must be positive');

  const execute = async (trx: typeof db) => {
    let retries = 3;
    while (retries > 0) {
      try {
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
        } as InsertTrustTransaction, trx);
        return result.ok(record);
      } catch (error: any) {
        if (error?.code === '40001' || retries === 1) {
          retries--;
          if (retries === 0) throw error;
        } else {
          throw error;
        }
      }
    }
    return result.internalError('Failed to record trust withdrawal');
  };

  try {
    return tx ? await execute(tx) : await db.transaction(execute);
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
