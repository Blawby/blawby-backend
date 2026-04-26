import { relations } from 'drizzle-orm';
import { billingTransactions } from '@/modules/invoices/database/schema/billing-transactions.schema';
import { invoiceLineItems } from '@/modules/invoices/database/schema/invoice-line-items.schema';
import { invoices } from '@/modules/invoices/database/schema/invoices.schema';
import { paymentLinks } from '@/modules/invoices/database/schema/payment-links.schema';
import { matters } from '@/modules/matters/database/schema/matters.schema';
import { stripeConnectedAccounts } from '@/modules/onboarding/schemas/onboarding.schema';
import { clients } from '@/modules/clients/database/schema/clients.schema';
import { organizations, users } from '@/schema/better-auth-schema';

export const invoicesRelations = relations(invoices, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [invoices.organization_id],
    references: [organizations.id],
  }),
  client: one(clients, {
    fields: [invoices.client_id],
    references: [clients.id],
  }),
  matter: one(matters, {
    fields: [invoices.matter_id],
    references: [matters.id],
  }),
  connectedAccount: one(stripeConnectedAccounts, {
    fields: [invoices.connected_account_id],
    references: [stripeConnectedAccounts.id],
  }),
  deletedByUser: one(users, {
    fields: [invoices.deleted_by],
    references: [users.id],
  }),
  line_items: many(invoiceLineItems),
  paymentLinks: many(paymentLinks),
  billingTransactions: many(billingTransactions),
}));
