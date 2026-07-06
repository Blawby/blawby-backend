import { relations, sql } from 'drizzle-orm';
import { pgTable, uuid, varchar, jsonb, text, timestamp, index, check } from 'drizzle-orm/pg-core';
import { organizations, users } from '@/schema';

export const pendingActions = pgTable(
  'pending_actions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organization_id: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    created_by_user_id: uuid('created_by_user_id')
      .notNull()
      .references(() => users.id),
    tool_name: varchar('tool_name', { length: 100 }).notNull(),
    tool_params: jsonb('tool_params').notNull(),
    idempotency_key: varchar('idempotency_key', { length: 64 }).notNull(),
    status: varchar('status', { length: 20 }).notNull().default('pending'),
    reviewed_by_user_id: uuid('reviewed_by_user_id').references(() => users.id),
    reviewed_at: timestamp('reviewed_at', { withTimezone: true, mode: 'date' }),
    review_notes: text('review_notes'),
    executed_at: timestamp('executed_at', { withTimezone: true, mode: 'date' }),
    execution_result: jsonb('execution_result'),
    execution_error: text('execution_error'),
    expires_at: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
    created_at: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_pending_actions_org').on(table.organization_id),
    index('idx_pending_actions_status').on(table.status),
    index('idx_pending_actions_org_status').on(table.organization_id, table.status),
    index('idx_pending_actions_idempotency_key').on(table.idempotency_key),
    check(
      'pending_actions_status_check',
      sql`status IN ('pending', 'approved', 'rejected', 'executing', 'executed', 'failed', 'expired')`
    ),
  ]
);

export const pendingActionsRelations = relations(pendingActions, ({ one }) => ({
  organization: one(organizations, {
    fields: [pendingActions.organization_id],
    references: [organizations.id],
  }),
  createdByUser: one(users, {
    fields: [pendingActions.created_by_user_id],
    references: [users.id],
    relationName: 'createdByUser',
  }),
  reviewedByUser: one(users, {
    fields: [pendingActions.reviewed_by_user_id],
    references: [users.id],
    relationName: 'reviewedByUser',
  }),
}));

export type InsertPendingAction = typeof pendingActions.$inferInsert;
export type SelectPendingAction = typeof pendingActions.$inferSelect;
