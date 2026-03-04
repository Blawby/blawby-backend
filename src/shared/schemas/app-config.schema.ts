import {
  pgTable,
  text,
  timestamp,
  jsonb,
} from 'drizzle-orm/pg-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';

export const appConfig = pgTable('app_configs', {
  key: text('key').primaryKey(), // e.g. "max_upload_size"
  value: jsonb('value').notNull(), // any JSON value: string, number, boolean, array, object
  type: text('type', {
    enum: ['string', 'number', 'boolean', 'multiselect', 'json'],
  }).notNull(),
  description: text('description'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull().$onUpdate(() => new Date()),
});

// Zod schemas
export const createAppConfigSchema = createInsertSchema(appConfig, {
  value: z.unknown(), // Allow any JSON-compatible value
});

export const selectAppConfigSchema = createSelectSchema(appConfig, {
  value: z.unknown(),
});

export type AppConfig = typeof appConfig.$inferSelect;
export type NewAppConfig = typeof appConfig.$inferInsert;
