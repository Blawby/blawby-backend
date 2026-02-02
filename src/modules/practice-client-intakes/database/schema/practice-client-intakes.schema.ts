import { relations } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  text,
  integer,
  jsonb,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';
import { z } from 'zod';
import { stripeConnectedAccounts } from '@/modules/onboarding/schemas/onboarding.schema';
import { addresses } from '@/modules/practice/database/schema/addresses.schema';
import { organizations } from '@/schema';

import { addressSchema } from '@/shared/validations/address';


export const practiceClientIntakes = pgTable(
  'practice_client_intakes',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    // Relations
    organization_id: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    connected_account_id: uuid('connected_account_id')
      .notNull()
      .references(() => stripeConnectedAccounts.id, { onDelete: 'restrict' }),

    // Stripe IDs
    stripe_payment_link_id: text('stripe_payment_link_id').notNull().unique(),
    stripe_payment_intent_id: text('stripe_payment_intent_id'), // Created by Payment Link, populated via webhook
    stripe_charge_id: text('stripe_charge_id'),

    // Payment Details (amounts in cents)
    amount: integer('amount').notNull(),
    application_fee: integer('application_fee'),
    currency: text('currency').notNull().default('usd'),
    status: text('status').notNull(),

    // Client Data
    metadata: jsonb('metadata').$type<PracticeClientIntakeMetadata>(),
    address_id: uuid('address_id').references(() => addresses.id, { onDelete: 'set null' }),

    // Security & Tracking
    client_ip: text('client_ip'),
    user_agent: text('user_agent'),

    // Timestamps
    succeeded_at: timestamp('succeeded_at', { withTimezone: true, mode: 'date' }),
    created_at: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('practice_client_intakes_org_idx').on(table.organization_id),
    index('practice_client_intakes_stripe_link_idx').on(table.stripe_payment_link_id),
    index('practice_client_intakes_stripe_intent_idx').on(table.stripe_payment_intent_id),
    index('practice_client_intakes_status_idx').on(table.status),
    index('practice_client_intakes_created_at_idx').on(table.created_at),
  ],
);

export type InsertPracticeClientIntake = typeof practiceClientIntakes.$inferInsert;
export type SelectPracticeClientIntake = typeof practiceClientIntakes.$inferSelect;

// Define relations
export const practiceClientIntakesRelations = relations(
  practiceClientIntakes,
  ({ one }) => ({
    organization: one(organizations, {
      fields: [practiceClientIntakes.organization_id],
      references: [organizations.id],
    }),
    connectedAccount: one(stripeConnectedAccounts, {
      fields: [practiceClientIntakes.connected_account_id],
      references: [stripeConnectedAccounts.id],
    }),
    address: one(addresses, {
      fields: [practiceClientIntakes.address_id],
      references: [addresses.id],
    }),
  }),
);

// Define metadata schema and type using Zod
export const practiceClientIntakeMetadataSchema = z.object({
  email: z.email(),
  name: z.string().min(1),
  phone: z.string().optional(),
  user_id: z.uuid().optional(),
  on_behalf_of: z.string().optional(),
  opposing_party: z.string().optional(),
  description: z.string().optional(),
  address: addressSchema.optional(),
});


export type PracticeClientIntakeMetadata = z.infer<typeof practiceClientIntakeMetadataSchema>;
