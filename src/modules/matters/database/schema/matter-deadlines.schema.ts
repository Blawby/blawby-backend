import { relations } from 'drizzle-orm';
import { pgTable, uuid, varchar, text, date, integer, timestamp, index } from 'drizzle-orm/pg-core';

import { matters } from '@/modules/matters/database/schema/matters.schema';

export const DEADLINE_TYPES = ['court', 'statutory', 'internal', 'reminder'] as const;
export type DeadlineType = (typeof DEADLINE_TYPES)[number];

export const matterDeadlines = pgTable(
  'matter_deadlines',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    matter_id: uuid('matter_id')
      .notNull()
      .references(() => matters.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    date: date('date').notNull(),
    type: varchar('type', { length: 20 }).$type<DeadlineType>().notNull(),
    source: text('source'),
    // Stored as comma-separated integers; parsed in application layer
    alert_days_before: varchar('alert_days_before', { length: 255 }),
    created_at: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    index('matter_deadlines_matter_idx').on(table.matter_id),
    index('matter_deadlines_date_idx').on(table.date),
    index('matter_deadlines_type_idx').on(table.type),
  ]
);

export const matterDeadlinesRelations = relations(matterDeadlines, ({ one }) => ({
  matter: one(matters, {
    fields: [matterDeadlines.matter_id],
    references: [matters.id],
  }),
}));

export type InsertMatterDeadline = typeof matterDeadlines.$inferInsert;
export type SelectMatterDeadline = typeof matterDeadlines.$inferSelect;

export const serializeAlertDays = (days: number[]): string => [...new Set(days)].sort((a, b) => a - b).join(',');

export const parseAlertDays = (raw: string | null): number[] => {
  if (!raw) return [];
  return raw
    .split(',')
    .map(Number)
    .filter((n) => !isNaN(n) && n > 0);
};
