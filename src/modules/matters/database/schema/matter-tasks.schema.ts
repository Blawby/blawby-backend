import { relations } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  varchar,
  text,
  date,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';
import { matters } from './matters.schema';
import { users } from '@/schema';

export const matterTasks = pgTable(
  'matter_tasks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    matter_id: uuid('matter_id')
      .notNull()
      .references(() => matters.id, {
        onDelete: 'cascade',
      }),
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),
    assignee_id: uuid('assignee_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    due_date: date('due_date'),
    status: varchar('status', { length: 20 }).notNull().default('pending'),
    priority: varchar('priority', { length: 20 }).notNull().default('normal'),
    stage: varchar('stage', { length: 100 }).notNull(),
    created_at: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('matter_tasks_matter_idx').on(table.matter_id),
    index('matter_tasks_assignee_idx').on(table.assignee_id),
    index('matter_tasks_status_idx').on(table.status),
    index('matter_tasks_priority_idx').on(table.priority),
    index('matter_tasks_stage_idx').on(table.stage),
    index('matter_tasks_due_date_idx').on(table.due_date),
  ],
);

export const matterTasksRelations = relations(matterTasks, ({ one }) => ({
  matter: one(matters, {
    fields: [matterTasks.matter_id],
    references: [matters.id],
  }),
  assignee: one(users, {
    fields: [matterTasks.assignee_id],
    references: [users.id],
  }),
}));

export type InsertMatterTask = typeof matterTasks.$inferInsert;
export type SelectMatterTask = typeof matterTasks.$inferSelect;
