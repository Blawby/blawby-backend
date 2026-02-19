import { eq } from 'drizzle-orm';
import {
  billingTransactions,
  type InsertBillingTransaction,
  type SelectBillingTransaction,
} from '../schema/billing-transactions.schema';
import { db } from '@/shared/database';

/**
 * Billing Transactions Repository
 */
export const billingTransactionsRepository = {
  /**
   * Create a new billing transaction
   */
  async createTransaction(
    data: InsertBillingTransaction,
    tx?: typeof db,
  ): Promise<SelectBillingTransaction> {
    const client = tx || db;
    const [transaction] = await client
      .insert(billingTransactions)
      .values(data)
      .returning();

    return transaction;
  },

  /**
   * Find a transaction by Stripe Transfer ID
   */
  async findByStripeTransferId(
    stripeTransferId: string,
  ): Promise<SelectBillingTransaction | null> {
    const [transaction] = await db
      .select()
      .from(billingTransactions)
      .where(eq(billingTransactions.stripe_transfer_id, stripeTransferId))
      .limit(1);

    return transaction || null;
  },

  /**
   * Update transaction status
   */
  async updateTransactionStatus(
    id: string,
    status: SelectBillingTransaction['status'],
    extras?: Partial<SelectBillingTransaction>,
    tx?: typeof db,
  ): Promise<void> {
    const client = tx || db;
    await client
      .update(billingTransactions)
      .set({
        status,
        ...extras,
      })
      .where(eq(billingTransactions.id, id));
  },

  /**
   * List transactions for an invoice
   */
  async listByInvoiceId(
    invoiceId: string,
    tx?: typeof db,
  ): Promise<SelectBillingTransaction[]> {
    const client = tx || db;
    return await client
      .select()
      .from(billingTransactions)
      .where(eq(billingTransactions.invoice_id, invoiceId));
  },
};
