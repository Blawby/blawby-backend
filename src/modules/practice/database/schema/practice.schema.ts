import { relations } from 'drizzle-orm';
import {
  pgTable, uuid, text, timestamp, integer, boolean, jsonb,
  uniqueIndex, index,
} from 'drizzle-orm/pg-core';
import { addresses } from './addresses.schema';
import type { PracticeDetailsSupportedStates } from '@/modules/practice/types/practice-details.types';
import { organizations, users } from '@/schema/better-auth-schema';

// Drizzle table definition
export const practiceDetails = pgTable('practice_details', {
  id: uuid('id').primaryKey().defaultRandom(),
  organization_id: uuid('organization_id')
    .notNull()
    .unique() // Add unique constraint for upsert
    .references(() => organizations.id, { onDelete: 'cascade' }),
  user_id: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  address_id: uuid('address_id').references(() => addresses.id, {
    onDelete: 'set null',
  }),
  business_phone: text('business_phone'),
  business_email: text('business_email'),
  website: text('website'),
  consultation_fee: integer('consultation_fee'),
  payment_url: text('payment_url'),
  calendly_url: text('calendly_url'),
  intro_message: text('intro_message'),
  overview: text('overview'),
  accent_color: text('accent_color'),
  is_public: boolean('is_public').default(false).notNull(),
  billing_increment_minutes: integer('billing_increment_minutes').default(1).notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
  supported_states: jsonb('supported_states').$type<PracticeDetailsSupportedStates[]>(),
});

// Practice services table (normalized)
export const practiceServices = pgTable('practice_services', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  key: text('key').notNull(),
  organization_id: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  description: text('description'),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  uniqueIndex('practice_services_org_key_idx').on(table.organization_id, table.key),
  index('practice_services_key_idx').on(table.key),
]);

// Define relations
export const practiceDetailsRelations = relations(
  practiceDetails,
  ({ many, one }) => ({
    organization: one(organizations, {
      fields: [practiceDetails.organization_id],
      references: [organizations.id],
    }),
    user: one(users, {
      fields: [practiceDetails.user_id],
      references: [users.id],
    }),
    address: one(addresses, {
      fields: [practiceDetails.address_id],
      references: [addresses.id],
    }),
    services: many(practiceServices),
  }),
);

export const practiceServicesRelations = relations(
  practiceServices,
  ({ one }) => ({
    organization: one(organizations, {
      fields: [practiceServices.organization_id],
      references: [organizations.id],
    }),
    practiceDetails: one(practiceDetails, {
      fields: [practiceServices.organization_id],
      references: [practiceDetails.organization_id],
    }),
  }),
);

// Types inferred from the table
export type PracticeDetails = typeof practiceDetails.$inferSelect;
export type InsertPracticeDetails = typeof practiceDetails.$inferInsert;
export type PracticeService = typeof practiceServices.$inferSelect;
export type InsertPracticeService = typeof practiceServices.$inferInsert;
