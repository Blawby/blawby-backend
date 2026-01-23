import { relations } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  index,
  unique,
} from 'drizzle-orm/pg-core';

import { organizations, users } from '@/schema/better-auth-schema';
import { practiceClientIntakes } from '@/modules/practice-client-intakes/database/schema/practice-client-intakes.schema';
import { addresses } from '@/modules/practice/database/schema/addresses.schema';

export const practiceClients = pgTable(
  'practice_clients',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organization_id: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),

    name: varchar('name', { length: 255 }).notNull(),
    email: varchar('email', { length: 255 }).notNull(),
    phone: varchar('phone', { length: 50 }),

    address_id: uuid('address_id').references(() => addresses.id, { onDelete: 'set null' }),

    stripe_customer_id: varchar('stripe_customer_id', { length: 255 }),
    status: varchar('status', { length: 20 }).notNull().default('lead'), // 'lead', 'active', 'inactive', 'archived'
    currency: varchar('currency', { length: 3 }).notNull().default('usd'),
    event_name: varchar('event_name', { length: 255 }), // Source tracking

    intake_id: uuid('intake_id').references(() => practiceClientIntakes.id, { onDelete: 'set null' }),

    deleted_at: timestamp('deleted_at', { withTimezone: true, mode: 'date' }),
    deleted_by: uuid('deleted_by').references(() => users.id, { onDelete: 'set null' }),

    created_at: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('practice_clients_org_idx').on(table.organization_id),
    index('practice_clients_email_idx').on(table.email),
    index('practice_clients_status_idx').on(table.status),
    index('practice_clients_stripe_id_idx').on(table.stripe_customer_id),
    index('practice_clients_address_idx').on(table.address_id),
    index('practice_clients_deleted_at_idx').on(table.deleted_at),
    index('practice_clients_created_at_idx').on(table.created_at),
    unique('practice_clients_org_email_unique').on(table.organization_id, table.email),
  ],
);

export const practiceClientsRelations = relations(practiceClients, ({ one }) => ({
  organization: one(organizations, {
    fields: [practiceClients.organization_id],
    references: [organizations.id],
  }),
  intake: one(practiceClientIntakes, {
    fields: [practiceClients.intake_id],
    references: [practiceClientIntakes.id],
  }),
  address: one(addresses, {
    fields: [practiceClients.address_id],
    references: [addresses.id],
  }),
  deletedByUser: one(users, {
    fields: [practiceClients.deleted_by],
    references: [users.id],
  }),
}));

export const practiceClientsSchema = {
  practiceClients,
  practiceClientsRelations,
};

export type InsertPracticeClient = typeof practiceClients.$inferInsert;
export type SelectPracticeClient = typeof practiceClients.$inferSelect;
