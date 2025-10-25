import {
  pgTable,
  uuid,
  text,
  json,
  timestamp,
  boolean,
  integer,
} from 'drizzle-orm/pg-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';

import { users, organizations } from '@/schema';

// TypeScript types for JSON fields
export type EventMetadata = {
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
  source: string;
  environment: string;
};

export type BaseEvent = {
  eventId: string;
  eventType: string;
  eventVersion: string;
  timestamp: Date;
  actorId?: string; // Who/what performed the action (user ID, system, etc.)
  actorType?: string; // Type of actor: 'user', 'system', 'webhook', etc.
  organizationId?: string; // Context where the event happened
  payload: Record<string, unknown>;
  metadata: EventMetadata;
  processed?: boolean;
  retryCount?: number;
};

// Events table
export const events = pgTable('events', {
  id: uuid('id').primaryKey().defaultRandom(),

  // Event identification
  eventId: text('event_id').notNull().unique(),
  eventType: text('event_type').notNull(),
  eventVersion: text('event_version').default('1.0.0').notNull(),

  // Actor information
  actorId: text('actor_id'), // Who/what performed the action (user ID, system, etc.)
  actorType: text('actor_type'), // Type of actor: 'user', 'system', 'webhook', etc.
  organizationId: text('organization_id').references(() => organizations.id, {
    onDelete: 'set null',
  }),

  // Event data
  payload: json('payload').notNull(),
  metadata: json('metadata').notNull().$type<EventMetadata>(),

  // Processing status
  processed: boolean('processed').default(false).notNull(),
  retryCount: integer('retry_count').default(0).notNull(),
  lastError: text('last_error'),
  processedAt: timestamp('processed_at'),

  // Timestamps
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Event subscriptions table (for user preferences)
export const eventSubscriptions = pgTable('event_subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  eventType: text('event_type').notNull(),
  channel: text('channel').notNull(), // 'email', 'webhook', 'in_app'
  enabled: boolean('enabled').default(true).notNull(),
  config: json('config').default({}).$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Zod schemas for validation
export const createEventSchema = createInsertSchema(events, {
  eventType: z.string().min(1),
  eventVersion: z.string().default('1.0.0'),
  payload: z.record(z.string(), z.any()),
  metadata: z.object({
    ipAddress: z.string().optional(),
    userAgent: z.string().optional(),
    requestId: z.string().optional(),
    source: z.string(),
    environment: z.string(),
  }),
});

export const updateEventSchema = createEventSchema.partial();

export const selectEventSchema = createSelectSchema(events);

export const createEventSubscriptionSchema = createInsertSchema(
  eventSubscriptions,
  {
    eventType: z.string().min(1),
    channel: z.enum(['email', 'webhook', 'in_app']),
    config: z.record(z.string(), z.any()).default({}),
  },
);

export const updateEventSubscriptionSchema
  = createEventSubscriptionSchema.partial();

export const selectEventSubscriptionSchema
  = createSelectSchema(eventSubscriptions);

// Request/Response schemas
export const publishEventRequestSchema = z.object({
  eventType: z.string().min(1),
  eventVersion: z.string().default('1.0.0'),
  actorId: z.string().optional(),
  actorType: z.enum(['user', 'system', 'webhook', 'cron', 'api']).optional(),
  organizationId: z.string().optional(),
  payload: z.record(z.string(), z.any()),
  metadata: z.object({
    ipAddress: z.string().optional(),
    userAgent: z.string().optional(),
    requestId: z.string().optional(),
    source: z.string(),
    environment: z.string(),
  }),
});

export const eventTimelineQuerySchema = z.object({
  actorId: z.string().optional(),
  actorType: z.enum(['user', 'system', 'webhook', 'cron', 'api']).optional(),
  organizationId: z.string().optional(),
  eventTypes: z.array(z.string()).optional(),
  limit: z.number().min(1).max(100).default(50),
  offset: z.number().min(0).default(0),
});

// Export types
export type Event = typeof events.$inferSelect;
export type NewEvent = typeof events.$inferInsert;
export type EventSubscription = typeof eventSubscriptions.$inferSelect;
export type NewEventSubscription = typeof eventSubscriptions.$inferInsert;

export type PublishEventRequest = z.infer<typeof publishEventRequestSchema>;
export type EventTimelineQuery = z.infer<typeof eventTimelineQuerySchema>;

// Re-export event types from enum file
export {
  EventType,
  type EventTypeValue,
  isValidEventType,
  getEventTypeByDomain,
  EVENT_DOMAINS,
} from '@/shared/events/enums/event-types';
