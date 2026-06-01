import { pgTable, uuid, text, bigint, boolean, timestamp, index, jsonb } from 'drizzle-orm/pg-core';
import { organizations } from '@/schema/better-auth-schema';

/**
 * Payouts ledger
 *
 * One row per Stripe payout (a settlement batch moving funds from a connected
 * account's Stripe balance to its external bank account/card). Populated and kept
 * in sync from `payout.*` Stripe Connect webhooks. This is the source of truth for
 * the practice-facing payout transaction history / reporting endpoint.
 */
export const payouts = pgTable(
  'payouts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organization_id: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    // Connected account the payout belongs to (acct_...)
    stripe_account_id: text('stripe_account_id').notNull(),
    // The Stripe payout id (po_...)
    stripe_payout_id: text('stripe_payout_id').notNull().unique(),
    amount: bigint('amount', { mode: 'number' }).notNull(), // in cents
    currency: text('currency').notNull(),
    // Stripe payout status: paid | pending | in_transit | canceled | failed
    status: text('status').notNull(),
    // Stripe payout type: bank_account | card
    type: text('type'),
    // Stripe payout method: standard | instant
    method: text('method'),
    description: text('description'),
    statement_descriptor: text('statement_descriptor'),
    failure_code: text('failure_code'),
    failure_message: text('failure_message'),
    // External account the funds were sent to (ba_... / card_...)
    destination_id: text('destination_id'),
    // Balance transaction representing the payout itself (txn_...)
    balance_transaction_id: text('balance_transaction_id'),
    automatic: boolean('automatic').notNull().default(false),
    // When the funds are expected to (or did) arrive in the bank account
    arrival_date: timestamp('arrival_date', { withTimezone: true, mode: 'date' }),
    // When Stripe created the payout (the settlement batch timestamp)
    stripe_created_at: timestamp('stripe_created_at', { withTimezone: true, mode: 'date' }).notNull(),
    metadata: jsonb('metadata').$type<Record<string, string>>(),
    // Tracks which Stripe webhook event last wrote this row; used to guard against
    // out-of-order delivery (e.g. payout.paid arriving before payout.created).
    // Tie-break: events with the same second use last_stripe_event_id (lexicographic, Stripe IDs are time-ordered).
    last_stripe_event_created_at: timestamp('last_stripe_event_created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    last_stripe_event_id: text('last_stripe_event_id').notNull().default(''),
    created_at: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    index('payouts_organization_idx').on(table.organization_id),
    index('payouts_stripe_account_idx').on(table.stripe_account_id),
    index('payouts_status_idx').on(table.status),
    index('payouts_arrival_date_idx').on(table.arrival_date),
    index('payouts_stripe_created_at_idx').on(table.stripe_created_at),
    // Covers listByOrganization when status filter is present
    index('payouts_org_status_created_at_id_idx').on(
      table.organization_id,
      table.status,
      table.stripe_created_at,
      table.id
    ),
    // Covers listByOrganization when no status filter (unfiltered ordered scan)
    index('payouts_org_created_at_id_idx').on(
      table.organization_id,
      table.stripe_created_at,
      table.id
    ),
  ]
);

export type SelectPayout = typeof payouts.$inferSelect;
export type InsertPayout = typeof payouts.$inferInsert;
