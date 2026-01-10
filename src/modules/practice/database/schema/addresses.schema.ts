import { relations, sql } from 'drizzle-orm';
import { pgTable, uuid, text, timestamp, check } from 'drizzle-orm/pg-core';

import { users, organizations } from '@/schema/better-auth-schema';

// Drizzle table definition
export const addresses = pgTable(
  'addresses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organization_id: uuid('organization_id').references(() => organizations.id, {
      onDelete: 'cascade',
    }),
    user_id: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').notNull().default('practice_location'), // e.g., 'practice_location', 'billing', 'home'
    line1: text('line1'),
    line2: text('line2'),
    city: text('city'),
    state: text('state'),
    postal_code: text('postal_code'),
    country: text('country'),
    created_at: timestamp('created_at').defaultNow().notNull(),
    updated_at: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    // Ensure at least one owner is present
    check(
      'owner_check',
      sql`(${table.organization_id} IS NOT NULL) OR (${table.user_id} IS NOT NULL)`,
    ),
  ],
);

// Define relations
export const addressesRelations = relations(addresses, ({ one }) => ({
  organization: one(organizations, {
    fields: [addresses.organization_id],
    references: [organizations.id],
  }),
  user: one(users, {
    fields: [addresses.user_id],
    references: [users.id],
  }),
}));

// Types inferred from the table
export type Address = typeof addresses.$inferSelect;
export type InsertAddress = typeof addresses.$inferInsert;
