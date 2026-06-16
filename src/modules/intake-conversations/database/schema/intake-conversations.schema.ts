import { organizations, users } from '@/schema/better-auth-schema';
import { boolean, index, integer, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

export const intakeConversations = pgTable(
  'intake_conversations',
  {
    id: uuid('id').primaryKey(),
    organization_id: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    client_user_id: uuid('client_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    is_anonymous: boolean('is_anonymous').notNull().default(false),
    matter_id: uuid('matter_id'),
    status: varchar('status')
      .notNull()
      .default('draft')
      .$type<'draft' | 'active' | 'submitted' | 'closed' | 'archived'>(),
    lifecycle_status: varchar('lifecycle_status')
      .notNull()
      .default('pending_visibility')
      .$type<'pending_visibility' | 'visible' | 'archived'>(),
    assigned_to_user_id: uuid('assigned_to_user_id').references(() => users.id, { onDelete: 'set null' }),
    priority: varchar('priority').notNull().default('normal').$type<'low' | 'normal' | 'high' | 'urgent'>(),
    tags: text('tags').array(),
    internal_notes: text('internal_notes'),
    last_message_at: timestamp('last_message_at', { withTimezone: true, mode: 'date' }),
    last_message_content: text('last_message_content'),
    latest_seq: integer('latest_seq').notNull().default(0),
    intake_mode_activated_at: timestamp('intake_mode_activated_at', { withTimezone: true, mode: 'date' }),
    ai_failed_at: timestamp('ai_failed_at', { withTimezone: true, mode: 'date' }),
    first_response_at: timestamp('first_response_at', { withTimezone: true, mode: 'date' }),
    closed_at: timestamp('closed_at', { withTimezone: true, mode: 'date' }),
    created_at: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [
    index('intake_conversations_org_lifecycle_last_message_idx').on(
      t.organization_id,
      t.lifecycle_status,
      t.last_message_at
    ),
    index('intake_conversations_org_status_idx').on(t.organization_id, t.status),
    index('intake_conversations_matter_idx').on(t.matter_id),
    index('intake_conversations_client_user_idx').on(t.client_user_id),
    index('intake_conversations_assigned_status_idx').on(t.assigned_to_user_id, t.status),
  ]
);

export type SelectIntakeConversation = typeof intakeConversations.$inferSelect;
export type InsertIntakeConversation = typeof intakeConversations.$inferInsert;
