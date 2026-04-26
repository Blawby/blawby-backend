/**
 * Events Dead Letter Schema
 *
 * Stores events that have exceeded max retries in the main events table.
 * This table serves as a dead letter queue for failed event processing,
 * allowing for manual inspection and potential reprocessing.
 */

import { pgTable, serial, uuid, text, jsonb, timestamp, integer } from 'drizzle-orm/pg-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import type { EventMetadata } from './events.schema';

/**
 * Events Dead Letter table
 *
 * Events are moved here when they fail processing MAX_RETRIES times.
 * Preserves full event data for debugging and potential manual reprocessing.
 */
export const eventsDeadLetter = pgTable('events_dead_letter', {
  // Auto-increment ID for this table
  id: serial('id').primaryKey(),

  // Original event identification (copied from events table)
  eventId: uuid('event_id').notNull(),
  type: text('event_type').notNull(),
  eventVersion: text('event_version').default('1.0.0').notNull(),

  // Actor information (copied from events table)
  actorId: uuid('actor_id').notNull(),
  actorType: text('actor_type').$type<'user' | 'system' | 'webhook' | 'cron' | 'api' | 'organization'>().notNull(),
  organizationId: uuid('organization_id'),

  // Event data (copied from events table)
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
  metadata: jsonb('metadata').$type<EventMetadata>().notNull(),

  // Failure information
  lastError: text('last_error'),
  retryCount: integer('retry_count').notNull(),
  failedAt: timestamp('failed_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),

  // When the original event was created
  originalCreatedAt: timestamp('original_created_at', { withTimezone: true, mode: 'date' }).notNull(),
});

// Zod schemas
export const insertEventsDeadLetterSchema = createInsertSchema(eventsDeadLetter);
export const selectEventsDeadLetterSchema = createSelectSchema(eventsDeadLetter);

// TypeScript types
export type EventDeadLetter = typeof eventsDeadLetter.$inferSelect;
export type NewEventDeadLetter = typeof eventsDeadLetter.$inferInsert;
