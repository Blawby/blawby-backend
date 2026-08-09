import { pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { organizations } from '@/schema/better-auth-schema';

export const krabiclawOrganizationLinks = pgTable(
  'krabiclaw_organization_links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    external_organization_id: text('external_organization_id').notNull(),
    organization_id: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'restrict' }),
    created_at: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('krabiclaw_organization_links_external_id_idx').on(table.external_organization_id),
    uniqueIndex('krabiclaw_organization_links_organization_id_idx').on(table.organization_id),
  ]
);

export type InsertKrabiClawOrganizationLink = typeof krabiclawOrganizationLinks.$inferInsert;
export type SelectKrabiClawOrganizationLink = typeof krabiclawOrganizationLinks.$inferSelect;
