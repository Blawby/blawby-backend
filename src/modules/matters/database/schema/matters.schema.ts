import { pgTable, uuid, varchar, text, integer, real, timestamp, index, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { practiceServices } from '@/modules/practice/database/schema/practice.schema';
import { userDetails } from '@/modules/user-details/database/schema/user-details.schema';
import { organizations, users } from '@/schema/better-auth-schema';

export const matters = pgTable(
  'matters',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organization_id: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, {
        onDelete: 'cascade',
      }),
    client_id: uuid('client_id').references(() => userDetails.id, {
      onDelete: 'set null',
    }),
    title: varchar('title', { length: 255 }).notNull(),
    description: text('description'),
    case_number: varchar('case_number', { length: 100 }),
    matter_type: varchar('matter_type', { length: 100 }),

    // Billing information
    billing_type: varchar('billing_type', { length: 20 })
      .notNull()
      .$type<'hourly' | 'fixed' | 'contingency' | 'pro_bono'>(), // 'hourly', 'fixed', 'contingency', 'pro_bono'
    total_fixed_price: integer('total_fixed_price'), // In cents, nullable
    contingency_percentage: real('contingency_percentage'), // Float, nullable
    settlement_amount: integer('settlement_amount'), // In cents, nullable

    // Service/Practice area reference
    practice_service_id: uuid('practice_service_id').references(() => practiceServices.id, {
      onDelete: 'set null',
    }),

    // Hourly rates
    admin_hourly_rate: integer('admin_hourly_rate'), // In cents, nullable
    attorney_hourly_rate: integer('attorney_hourly_rate'), // In cents, nullable

    // Payment settings
    payment_frequency: varchar('payment_frequency', { length: 20 }), // 'project', 'milestone', nullable

    retainer_balance: integer('retainer_balance').notNull().default(0), // In cents

    // Status
    status: varchar('status', { length: 40 }).notNull().default('first_contact'),
    urgency: varchar('urgency', { length: 20 }), // 'routine', 'time_sensitive', 'emergency'

    // Attorney assignments
    responsible_attorney_id: uuid('responsible_attorney_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    originating_attorney_id: uuid('originating_attorney_id').references(() => users.id, {
      onDelete: 'set null',
    }),

    // Court metadata
    court: text('court'),
    judge: text('judge'),
    opposing_party: text('opposing_party'),
    opposing_counsel: text('opposing_counsel'),

    // Matter lifecycle dates
    open_date: timestamp('open_date', { withTimezone: true, mode: 'date' }),
    close_date: timestamp('close_date', { withTimezone: true, mode: 'date' }),

    // Soft delete
    deleted_at: timestamp('deleted_at', { withTimezone: true, mode: 'date' }),
    deleted_by: uuid('deleted_by').references(() => users.id, {
      onDelete: 'set null',
    }),

    // Intake and Conversation linking
    conversation_id: uuid('conversation_id'),
    intake_uuid: uuid('intake_uuid'),
    on_behalf_of: text('on_behalf_of'),

    // Retainer settings
    retainer_low_balance_threshold: integer('retainer_low_balance_threshold'), // In cents, NULL = no warning

    // Timestamps
    created_at: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    index('matters_org_idx').on(table.organization_id),
    index('matters_client_idx').on(table.client_id),
    index('matters_status_idx').on(table.status),
    index('matters_practice_service_idx').on(table.practice_service_id),
    index('matters_deleted_at_idx').on(table.deleted_at),
    index('matters_created_at_idx').on(table.created_at),
    index('matters_retainer_balance_idx').on(table.retainer_balance),
    index('matters_intake_uuid_idx').on(table.intake_uuid),
    index('matters_conversation_id_idx').on(table.conversation_id),
    index('matters_retainer_threshold_idx')
      .on(table.retainer_low_balance_threshold)
      .where(sql`${table.retainer_low_balance_threshold} IS NOT NULL`),
    check('matters_retainer_threshold_non_negative', sql`${table.retainer_low_balance_threshold} >= 0`),
  ]
);

export type InsertMatter = typeof matters.$inferInsert;
export type SelectMatter = typeof matters.$inferSelect;
