import { organizations, users } from '@/schema/better-auth-schema';
import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

export const NOTIFICATION_CHANNELS = ['dashboard', 'email'] as const;
export const NOTIFICATION_STATUSES = ['pending', 'sent', 'failed', 'skipped'] as const;

export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];
export type NotificationStatus = (typeof NOTIFICATION_STATUSES)[number];

export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organization_id: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    recipient_user_id: uuid('recipient_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    actor_user_id: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    channel: varchar('channel', { length: 20 }).notNull().$type<NotificationChannel>(),
    status: varchar('status', { length: 20 }).notNull().$type<NotificationStatus>(),
    event_type: varchar('event_type', { length: 100 }).notNull(),
    template_name: varchar('template_name', { length: 100 }),
    title: varchar('title', { length: 200 }).notNull(),
    body: text('body'),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
    deduplication_key: varchar('deduplication_key', { length: 200 }),
    provider_message_id: varchar('provider_message_id', { length: 255 }),
    failure_code: varchar('failure_code', { length: 100 }),
    attempt_count: integer('attempt_count').notNull().default(0),
    last_attempt_at: timestamp('last_attempt_at', { withTimezone: true, mode: 'date' }),
    delivered_at: timestamp('delivered_at', { withTimezone: true, mode: 'date' }),
    read_at: timestamp('read_at', { withTimezone: true, mode: 'date' }),
    created_at: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    index('notifications_recipient_created_idx').on(table.organization_id, table.recipient_user_id, table.created_at),
    index('notifications_recipient_unread_idx')
      .on(table.organization_id, table.recipient_user_id, table.created_at)
      .where(sql`${table.channel} = 'dashboard' AND ${table.read_at} IS NULL`),
    index('notifications_delivery_status_idx').on(table.organization_id, table.channel, table.status),
    uniqueIndex('notifications_deduplication_unique_idx')
      .on(table.organization_id, table.recipient_user_id, table.channel, table.deduplication_key)
      .where(sql`${table.deduplication_key} IS NOT NULL`),
    check('notifications_channel_check', sql`${table.channel} IN ('dashboard', 'email')`),
    check('notifications_status_check', sql`${table.status} IN ('pending', 'sent', 'failed', 'skipped')`),
    check('notifications_email_template_check', sql`${table.channel} <> 'email' OR ${table.template_name} IS NOT NULL`),
  ]
);

export type InsertNotification = typeof notifications.$inferInsert;
export type SelectNotification = typeof notifications.$inferSelect;
