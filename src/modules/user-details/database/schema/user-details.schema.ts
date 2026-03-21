import { pgTable, uuid, varchar, timestamp, index, unique } from 'drizzle-orm/pg-core';
import { addresses } from '@/modules/practice/database/schema/addresses.schema';
import { practiceClientIntakes } from '@/modules/practice-client-intakes/database/schema/practice-client-intakes.schema';
import { organizations, users } from '@/schema/better-auth-schema';

export const userDetails = pgTable(
  'user_details',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organization_id: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    user_id: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    address_id: uuid('address_id').references(() => addresses.id, { onDelete: 'set null' }),

    stripe_customer_id: varchar('stripe_customer_id', { length: 255 }), // Customer ID on CONNECTED Stripe account (for client payments)
    status: varchar('status', { length: 20 }).notNull().default('lead'), // 'lead', 'active', 'inactive', 'archived'
    currency: varchar('currency', { length: 3 }).notNull().default('usd'),
    event_name: varchar('event_name', { length: 255 }), // Source tracking

    intake_id: uuid('intake_id').references(() => practiceClientIntakes.id, { onDelete: 'set null' }),

    deleted_at: timestamp('deleted_at', { withTimezone: true, mode: 'date' }),
    deleted_by: uuid('deleted_by').references(() => users.id, { onDelete: 'set null' }),

    created_at: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    index('user_details_org_idx').on(table.organization_id),
    index('user_details_user_idx').on(table.user_id),
    index('user_details_status_idx').on(table.status),
    index('user_details_stripe_id_idx').on(table.stripe_customer_id),
    index('user_details_address_idx').on(table.address_id),
    index('user_details_deleted_at_idx').on(table.deleted_at),
    index('user_details_created_at_idx').on(table.created_at),
    unique('user_details_org_user_unique').on(table.organization_id, table.user_id),
  ]
);

export const userDetailsSchema = {
  userDetails,
};

export type InsertUserDetail = typeof userDetails.$inferInsert;
export type SelectUserDetail = typeof userDetails.$inferSelect;
