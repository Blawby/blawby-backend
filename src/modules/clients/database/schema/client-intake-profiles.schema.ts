import { relations, sql } from 'drizzle-orm';
import { pgTable, uuid, varchar, text, date, integer, numeric, timestamp, check, unique } from 'drizzle-orm/pg-core';

import { clients } from '@/modules/clients/database/schema/clients.schema';

/**
 * Intake / eligibility profile for a client.
 *
 * Dedicated 1:1 sub-resource so eligibility + discount + intake metadata stay
 * out of the core `clients` contact model. The discount columns mirror Stripe's
 * Coupon model exactly (same field names and meaning): a discount is either
 * `amount_off` (in the minor currency unit, e.g. cents, paired with `currency`)
 * or `percent_off` (0 < value <= 100) — never both.
 */
export const clientIntakeProfiles = pgTable(
  'client_intake_profiles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    client_id: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),

    // Intake metadata
    date_of_birth: date('date_of_birth'), // required for conflict checks
    preferred_contact_method: varchar('preferred_contact_method', { length: 10 }), // 'phone' | 'email' | 'text'
    referral_source: varchar('referral_source', { length: 255 }),
    intake_date: date('intake_date'),

    // Eligibility
    eligibility_status: varchar('eligibility_status', { length: 20 }).notNull().default('pending'), // 'pending' | 'eligible' | 'ineligible' | 'referred'

    // Discount — mirrors Stripe's Coupon fields exactly (see table doc comment)
    amount_off: integer('amount_off'), // Stripe amount_off: discount in the currency's minor unit; requires currency
    percent_off: numeric('percent_off', { precision: 5, scale: 2, mode: 'number' }), // Stripe percent_off: 0 < value <= 100
    currency: varchar('currency', { length: 3 }), // Stripe currency: 3-letter ISO, required when amount_off is set
    discount_note: text('discount_note'),

    created_at: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    unique('client_intake_profiles_client_unique').on(table.client_id),
    check(
      'client_intake_profiles_discount_check',
      sql`(
        (${table.amount_off} IS NULL AND ${table.percent_off} IS NULL AND ${table.currency} IS NULL)
        OR (${table.amount_off} > 0 AND ${table.currency} IS NOT NULL AND ${table.percent_off} IS NULL)
        OR (${table.percent_off} > 0 AND ${table.percent_off} <= 100 AND ${table.amount_off} IS NULL AND ${table.currency} IS NULL)
      )`
    ),
  ]
);

export const clientIntakeProfilesRelations = relations(clientIntakeProfiles, ({ one }) => ({
  client: one(clients, {
    fields: [clientIntakeProfiles.client_id],
    references: [clients.id],
  }),
}));

export const clientIntakeProfilesSchema = {
  clientIntakeProfiles,
  clientIntakeProfilesRelations,
};

export type InsertClientIntakeProfile = typeof clientIntakeProfiles.$inferInsert;
export type SelectClientIntakeProfile = typeof clientIntakeProfiles.$inferSelect;
