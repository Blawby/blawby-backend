import { pgTable, uuid, text, integer, numeric, timestamp, index, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { organizations } from '@/schema/better-auth-schema';

export const engagementTemplates = pgTable(
  'engagement_templates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    practice_id: uuid('practice_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    practice_area: text('practice_area').notNull().default(''),
    fee_type: text('fee_type').notNull().default('hourly'),
    hourly_rate_cents: integer('hourly_rate_cents'),
    flat_fee_cents: integer('flat_fee_cents'),
    contingency_pct: numeric('contingency_pct', { precision: 5, scale: 2 }),
    retainer_cents: integer('retainer_cents'),
    scope_template: text('scope_template').notNull().default(''),
    body: text('body').notNull().default(''),
    published_at: timestamp('published_at', { withTimezone: true, mode: 'date' }),
    version: integer('version').notNull().default(1),
    last_reviewed_at: timestamp('last_reviewed_at', { withTimezone: true, mode: 'date' }),
    created_at: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    index('engagement_templates_practice_id_idx').on(table.practice_id),
    check(
      'engagement_templates_fee_type_check',
      sql`${table.fee_type} IN ('hourly', 'flat', 'contingency', 'pro_bono')`
    ),
  ]
);

export type InsertEngagementTemplate = typeof engagementTemplates.$inferInsert;
export type SelectEngagementTemplate = typeof engagementTemplates.$inferSelect;
