import { relations } from 'drizzle-orm';
import { billingTransactions } from '@/modules/invoices/database/schema/billing-transactions.schema';
import { invoices } from '@/modules/invoices/database/schema/invoices.schema';
import { matters } from '@/modules/matters/database/schema/matters.schema';

export const billingTransactionsRelations = relations(billingTransactions, ({ one }) => ({
  invoice: one(invoices, {
    fields: [billingTransactions.invoice_id],
    references: [invoices.id],
  }),
  matter: one(matters, {
    fields: [billingTransactions.matter_id],
    references: [matters.id],
  }),
}));
