import { relations } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  varchar,
  integer,
  date,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';

import { matters } from './matters.schema';
import { invoices } from '@/modules/invoices/database/schema/invoices.schema';

export const matterMilestones = pgTable(
  'matter_milestones',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    matter_id: uuid('matter_id')
      .notNull()
      .references(() => matters.id, {
        onDelete: 'cascade',
      }),
    description: varchar('description', { length: 255 }).notNull(),
    amount: integer('amount').notNull(), // in cents
    due_date: date('due_date').notNull(),
    status: varchar('status', { length: 20 }).notNull().default('pending'), // 'pending', 'in_progress', 'completed', 'overdue'
    order: integer('order').notNull().default(0),
    invoice_id: uuid('invoice_id').references(() => invoices.id, { onDelete: 'set null' }),
    invoiced_at: timestamp('invoiced_at', { withTimezone: true, mode: 'date' }),
    created_at: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('matter_milestones_matter_idx').on(table.matter_id),
    index('matter_milestones_status_idx').on(table.status),
    index('matter_milestones_due_date_idx').on(table.due_date),
    index('matter_milestones_order_idx').on(table.order),
  ],
);

// Define relations
export const matterMilestonesRelations = relations(matterMilestones, ({ one }) => ({
  matter: one(matters, {
    fields: [matterMilestones.matter_id],
    references: [matters.id],
  }),
}));

export type InsertMatterMilestone = typeof matterMilestones.$inferInsert;
export type SelectMatterMilestone = typeof matterMilestones.$inferSelect;
