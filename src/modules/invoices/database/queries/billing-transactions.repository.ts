import { eq } from 'drizzle-orm';

import { getActiveTx } from '@/shared/database/uow';
import {
  billingTransactionsSchema,
  type InsertBillingTransaction,
  type SelectBillingTransaction,
} from '@/modules/invoices/database/schema';

const { billingTransactions } = billingTransactionsSchema;

/**
 * Create a new billing transaction
 */
const createTransaction = async (data: InsertBillingTransaction): Promise<SelectBillingTransaction> => {
  const [transaction] = await getActiveTx().insert(billingTransactions).values(data).returning();

  if (!transaction) {
    throw new Error('Failed to create billing transaction');
  }

  return transaction;
};

/**
 * Find a transaction by Stripe Transfer ID
 */
const findByStripeTransferId = async (stripeTransferId: string): Promise<SelectBillingTransaction | null> => {
  const [transaction] = await getActiveTx()
    .select()
    .from(billingTransactions)
    .where(eq(billingTransactions.stripe_transfer_id, stripeTransferId))
    .limit(1);

  return transaction ?? null;
};

/**
 * Update transaction status
 */
const updateTransactionStatus = async (
  id: string,
  status: SelectBillingTransaction['status'],
  extras?: Partial<SelectBillingTransaction>
): Promise<void> => {
  await getActiveTx()
    .update(billingTransactions)
    .set({
      status,
      ...extras,
    })
    .where(eq(billingTransactions.id, id));
};

/**
 * List transactions for an invoice
 */
const listByInvoiceId = async (invoiceId: string): Promise<SelectBillingTransaction[]> =>
  await getActiveTx().select().from(billingTransactions).where(eq(billingTransactions.invoice_id, invoiceId));

/**
 * Billing Transactions Repository
 */
export const billingTransactionsRepository = {
  createTransaction,
  findByStripeTransferId,
  updateTransactionStatus,
  listByInvoiceId,
} as const;
