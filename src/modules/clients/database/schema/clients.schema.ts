import { pgTable, uuid, varchar, timestamp, date, index, unique } from 'drizzle-orm/pg-core';
import { addresses } from '@/modules/practice/database/schema/addresses.schema';
import { practiceClientIntakes } from '@/modules/practice-client-intakes/database/schema/practice-client-intakes.schema';
import { organizations, users } from '@/schema/better-auth-schema';

export const clients = pgTable(
  'clients',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organization_id: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    user_id: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),

    // Direct identity fields - client record is self-contained
    name: varchar('name', { length: 255 }),
    email: varchar('email', { length: 255 }),
    date_of_birth: date('date_of_birth'),

    address_id: uuid('address_id').references(() => addresses.id, { onDelete: 'set null' }),

    stripe_customer_id: varchar('stripe_customer_id', { length: 255 }), // Stripe customer ID on the PLATFORM account — used with on_behalf_of for invoice billing
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
    index('clients_org_idx').on(table.organization_id),
    index('clients_user_idx').on(table.user_id),
    index('clients_status_idx').on(table.status),
    index('clients_stripe_id_idx').on(table.stripe_customer_id),
    index('clients_address_idx').on(table.address_id),
    index('clients_deleted_at_idx').on(table.deleted_at),
    index('clients_created_at_idx').on(table.created_at),
    unique('clients_org_user_unique').on(table.organization_id, table.user_id),
  ]
);

export const clientsSchema = {
  clients,
};

export type InsertClient = typeof clients.$inferInsert;
export type SelectClient = typeof clients.$inferSelect;
