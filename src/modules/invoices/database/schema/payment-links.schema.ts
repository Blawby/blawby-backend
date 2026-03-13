import { relations } from 'drizzle-orm';
import { pgTable, uuid, varchar, integer, timestamp, index } from 'drizzle-orm/pg-core';
import { invoices } from '@/modules/invoices/database/schema/invoices.schema';
import { organizations } from '@/schema';

export const paymentLinks = pgTable(
  'payment_links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organization_id: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    invoice_id: uuid('invoice_id').references(() => invoices.id, {
      onDelete: 'set null',
    }),

    token: varchar('token', { length: 64 }).notNull().unique(),
    status: varchar('status', { length: 20 }).notNull().default('active'), // active, expired, completed, cancelled

    amount: integer('amount').notNull(), // in cents
    currency: varchar('currency', { length: 3 }).notNull().default('usd'),

    expires_at: timestamp('expires_at', { withTimezone: true, mode: 'date' }),
    accessed_at: timestamp('accessed_at', { withTimezone: true, mode: 'date' }),
    completed_at: timestamp('completed_at', { withTimezone: true, mode: 'date' }),

    stripe_payment_link_id: varchar('stripe_payment_link_id', { length: 255 }),
    stripe_payment_intent_id: varchar('stripe_payment_intent_id', {
      length: 255,
    }),

    created_at: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    index('payment_links_org_idx').on(table.organization_id),
    index('payment_links_invoice_idx').on(table.invoice_id),
    index('payment_links_token_idx').on(table.token),
  ]
);

export const paymentLinksRelations = relations(paymentLinks, ({ one }) => ({
  organization: one(organizations, {
    fields: [paymentLinks.organization_id],
    references: [organizations.id],
  }),
  invoice: one(invoices, {
    fields: [paymentLinks.invoice_id],
    references: [invoices.id],
  }),
}));

export const paymentLinksSchema = {
  paymentLinks,
  paymentLinksRelations,
};

export type InsertPaymentLink = typeof paymentLinks.$inferInsert;
export type SelectPaymentLink = typeof paymentLinks.$inferSelect;
