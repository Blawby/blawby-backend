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

/**
 * Shared Webhook Events Schema
 *
 * Used by both Stripe payment webhooks and Stripe Connect onboarding webhooks.
 * Provides idempotency, retry logic, and error handling for all webhook events.
 */
export const webhookEvents = pgTable('webhook_events', {
  id: uuid('id').primaryKey().defaultRandom(),

  // Stripe Event
  stripeEventId: text('stripe_event_id').notNull().unique(),
  eventType: text('event_type').notNull(),

  // Processing
  processed: boolean('processed').notNull().default(false),
  processedAt: timestamp('processed_at'),

  // Error Handling
  error: text('error'),
  errorStack: text('error_stack'),
  retryCount: integer('retry_count').notNull().default(0),
  maxRetries: integer('max_retries').notNull().default(3),
  nextRetryAt: timestamp('next_retry_at'),

  // Audit
  payload: json('payload').notNull(),
  headers: json('headers').$type<Record<string, string>>(),
  url: text('url'),

  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Zod schemas for validation
export const createWebhookEventSchema = createInsertSchema(webhookEvents);
export const selectWebhookEventSchema = createSelectSchema(webhookEvents);

// Webhook response schema
export const stripeWebhookResponseSchema = z.object({
  received: z.boolean(),
  alreadyProcessed: z.boolean().optional(),
  duplicate: z.boolean().optional(),
});

// TypeScript types
export type WebhookEvent = typeof webhookEvents.$inferSelect;
export type NewWebhookEvent = typeof webhookEvents.$inferInsert;
