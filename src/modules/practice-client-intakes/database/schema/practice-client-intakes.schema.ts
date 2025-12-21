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
import { organizations } from '@/schema';

export const practiceClientIntakes = pgTable(
  'practice_client_intakes',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    // Relations
    organizationId: text('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    connectedAccountId: uuid('connected_account_id')
      .notNull()
      .references(() => stripeConnectedAccounts.id, { onDelete: 'restrict' }),

    // Stripe IDs
    stripePaymentIntentId: text('stripe_payment_intent_id').notNull().unique(),
    stripeChargeId: text('stripe_charge_id'),

    // Payment Details (amounts in cents)
    amount: integer('amount').notNull(),
    applicationFee: integer('application_fee'),
    currency: text('currency').notNull().default('usd'),
    status: text('status').notNull(),

    // Client Data
    metadata: jsonb('metadata').$type<PracticeClientIntakeMetadata>(),

    // Security & Tracking
    clientIp: text('client_ip'),
    userAgent: text('user_agent'),

    // Timestamps
    succeededAt: timestamp('succeeded_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('practice_client_intakes_org_idx').on(table.organizationId),
    index('practice_client_intakes_stripe_intent_idx').on(table.stripePaymentIntentId),
    index('practice_client_intakes_status_idx').on(table.status),
    index('practice_client_intakes_created_at_idx').on(table.createdAt),
  ],
);

// Define relations
export const practiceClientIntakesRelations = relations(
  practiceClientIntakes,
  ({ one }) => ({
    organization: one(organizations, {
      fields: [practiceClientIntakes.organizationId],
      references: [organizations.id],
    }),
    connectedAccount: one(stripeConnectedAccounts, {
      fields: [practiceClientIntakes.connectedAccountId],
      references: [stripeConnectedAccounts.id],
    }),
  }),
);


export type InsertPracticeClientIntake = typeof practiceClientIntakes.$inferInsert;
export type SelectPracticeClientIntake = typeof practiceClientIntakes.$inferSelect;

// Define metadata schema and type using Zod
const practiceClientIntakeMetadataSchema = z.object({
  email: z.email(),
  name: z.string().min(1),
  phone: z.string().optional(),
  onBehalfOf: z.string().optional(),
  opposingParty: z.string().optional(),
  description: z.string().optional(),
});

export type PracticeClientIntakeMetadata = z.infer<typeof practiceClientIntakeMetadataSchema>;
