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
  eventId: string; // UUID primary key
  type: string; // Event type (renamed from eventType)
  eventVersion: string;
  timestamp: Date;
  actorId: string; // UUID - Who/what performed the action
  actorType: 'user' | 'system' | 'webhook' | 'cron' | 'api'; // Type of actor
  organizationId?: string; // Context where the event happened
  payload: Record<string, unknown>;
  metadata: EventMetadata;
  processed?: boolean;
  retryCount?: number;
  lastError?: string; // Error message from last failed processing attempt
};

// Events table
export const events = pgTable('events', {
  // Primary key: event_id (UUID) - renamed from id
  eventId: uuid('event_id').primaryKey().defaultRandom(),

  // Event identification
  type: text('event_type').notNull(),
  eventVersion: text('event_version').default('1.0.0').notNull(),

  // Actor information
  actorId: uuid('actor_id').notNull(), // Changed from text to uuid
  actorType: text('actor_type').notNull(), // Type of actor: 'user', 'system', 'webhook', etc.
  organizationId: uuid('organization_id').references(() => organizations.id, {
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
  userId: uuid('user_id')
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
  type: z.string().min(1),
  eventVersion: z.string().default('1.0.0'),
  actorId: z.uuid(),
  actorType: z.enum(['user', 'system', 'webhook', 'cron', 'api']),
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

export const baseEventSchema = z.object({
  eventId: z.uuid(),
  type: z.string(), // Renamed from eventType
  eventVersion: z.string(),
  timestamp: z.coerce.date(),
  actorId: z.uuid(), // Changed to uuid
  actorType: z.enum(['user', 'system', 'webhook', 'cron', 'api']),
  organizationId: z.uuid().optional(),
  payload: z.record(z.string(), z.unknown()),
  metadata: z.object({
    ipAddress: z.string().optional(),
    userAgent: z.string().optional(),
    requestId: z.string().optional(),
    source: z.string(),
    environment: z.string(),
  }),
  processed: z.boolean().optional(),
  retryCount: z.number().int().min(0).optional(),
});

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
  type: z.string().min(1), // Renamed from eventType
  eventVersion: z.string().default('1.0.0'),
  actorId: z.uuid(), // Changed to uuid, required
  actorType: z.enum(['user', 'system', 'webhook', 'cron', 'api']),
  organizationId: z.uuid().optional(),
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
  actorId: z.uuid().optional(),
  actorType: z.enum(['user', 'system', 'webhook', 'cron', 'api']).optional(),
  organizationId: z.uuid().optional(),
  eventTypes: z.array(z.string()).optional(), // Keep as eventTypes for query compatibility
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
