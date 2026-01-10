import { relations } from 'drizzle-orm';
import { pgTable, uuid, text, timestamp, integer, boolean, jsonb } from 'drizzle-orm/pg-core';

import { organizations, users } from '@/schema/better-auth-schema';
import { addresses } from './addresses.schema';

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
  is_public: boolean('is_public').default(false).notNull(),
  services: jsonb('services').$type<Array<{ id: string; name: string }>>(),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
});

// Define relations
export const practiceDetailsRelations = relations(
  practiceDetails,
  ({ one }) => ({
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
  }),
);

// Types inferred from the table
export type PracticeDetails = typeof practiceDetails.$inferSelect;
export type InsertPracticeDetails = typeof practiceDetails.$inferInsert;
