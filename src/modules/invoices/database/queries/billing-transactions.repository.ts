import { eq } from 'drizzle-orm';
import { billingTransactionsSchema } from '@/modules/invoices/database/schema';
import type { InsertBillingTransaction, SelectBillingTransaction } from '@/modules/invoices/database/schema';
import { db } from '@/shared/database';

const { billingTransactions } = billingTransactionsSchema;

/**
 * Create a new billing transaction
 */
const createTransaction = async (data: InsertBillingTransaction, tx?: typeof db): Promise<SelectBillingTransaction> => {
  const client = tx ?? db;
  const [transaction] = await client.insert(billingTransactions).values(data).returning();

  if (!transaction) {
    throw new Error('Failed to create billing transaction');
  }

  return transaction;
};

/**
 * Find a transaction by Stripe Transfer ID
 */
const findByStripeTransferId = async (stripeTransferId: string): Promise<SelectBillingTransaction | null> => {
  const [transaction] = await db
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
  extras?: Partial<SelectBillingTransaction>,
  tx?: typeof db
): Promise<void> => {
  const client = tx ?? db;
  await client
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
const listByInvoiceId = async (invoiceId: string, tx?: typeof db): Promise<SelectBillingTransaction[]> => {
  const client = tx ?? db;
  return await client.select().from(billingTransactions).where(eq(billingTransactions.invoice_id, invoiceId));
};

/**
 * Billing Transactions Repository
 */
export const billingTransactionsRepository = {
  createTransaction,
  findByStripeTransferId,
  updateTransactionStatus,
  listByInvoiceId,
} as const;
