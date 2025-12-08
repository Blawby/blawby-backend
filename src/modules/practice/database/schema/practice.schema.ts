import { relations } from 'drizzle-orm';
import { pgTable, uuid, text, timestamp, integer } from 'drizzle-orm/pg-core';

import { organizations, users } from '@/schema/better-auth-schema';

// Drizzle table definition
export const practiceDetails = pgTable('practice_details', {
  id: uuid('id').primaryKey(),
  organization_id: text('organization_id')
    .notNull()
    .unique() // Add unique constraint for upsert
    .references(() => organizations.id, { onDelete: 'cascade' }),
  user_id: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  business_phone: text('business_phone'),
  business_email: text('business_email'),
  consultation_fee: integer('consultation_fee'),
  payment_url: text('payment_url'),
  calendly_url: text('calendly_url'),
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
  }),
);

// Types inferred from the table
export type PracticeDetails = typeof practiceDetails.$inferSelect;
export type InsertPracticeDetails = typeof practiceDetails.$inferInsert;
