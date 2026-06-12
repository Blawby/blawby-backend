import { pgTable, uuid, varchar, text, integer, timestamp, index, unique, jsonb } from 'drizzle-orm/pg-core';
import { organizations, users } from '@/schema/better-auth-schema';
import { intakeConversations } from '@/modules/intake-conversations/database/schema/intake-conversations.schema';

export const intakeConversationMessages = pgTable(
  'intake_conversation_messages',
  {
    id: uuid('id').primaryKey(),
    conversation_id: uuid('conversation_id')
      .notNull()
      .references(() => intakeConversations.id, { onDelete: 'cascade' }),
    organization_id: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    user_id: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    role: varchar('role').notNull().$type<'user' | 'assistant' | 'system'>(),
    content: text('content').notNull(),
    reply_to_message_id: uuid('reply_to_message_id'),
    metadata: jsonb('metadata'),
    seq: integer('seq').notNull(),
    client_id: text('client_id').notNull(),
    token_count: integer('token_count'),
    created_at: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [
    // seq is worker-assigned and monotonically increasing — a seq collision means data corruption, must throw
    unique('intake_conversation_messages_conv_seq_uniq').on(t.conversation_id, t.seq),
    // client_id is the idempotency key used in upsert onConflictDoNothing
    unique('intake_conversation_messages_conv_client_id_uniq').on(t.conversation_id, t.client_id),
    index('intake_conversation_messages_conv_seq_idx').on(t.conversation_id, t.seq),
    index('intake_conversation_messages_org_idx').on(t.organization_id),
  ]
);

export type SelectIntakeConversationMessage = typeof intakeConversationMessages.$inferSelect;
export type InsertIntakeConversationMessage = typeof intakeConversationMessages.$inferInsert;
