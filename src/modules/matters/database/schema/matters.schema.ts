import { relations } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  real,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';

import { organizations, users } from '@/schema';
import { practiceAreas } from './practice-areas.schema';

export const matters = pgTable(
  'matters',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, {
        onDelete: 'cascade',
      }),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => users.id, {
        onDelete: 'cascade',
      }),
    title: varchar('title', { length: 255 }).notNull(),
    description: text('description'),

    // Billing information
    billingType: varchar('billing_type', { length: 20 }).notNull(), // 'hourly', 'fixed', 'contingency'
    totalFixedPrice: integer('total_fixed_price'), // in cents, nullable
    contingencyPercentage: real('contingency_percentage'), // float, nullable
    settlementAmount: integer('settlement_amount'), // in cents, nullable

    // Practice area
    practiceAreaId: uuid('practice_area_id').references(() => practiceAreas.id, {
      onDelete: 'set null',
    }),

    // Hourly rates
    adminHourlyRate: integer('admin_hourly_rate'), // in cents, nullable
    attorneyHourlyRate: integer('attorney_hourly_rate'), // in cents, nullable

    // Payment settings
    paymentFrequency: varchar('payment_frequency', { length: 20 }), // 'project', 'milestone', nullable

    // Status
    status: varchar('status', { length: 20 }).notNull().default('draft'), // 'draft', 'active'

    // Soft delete
    deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'date' }),
    deletedBy: uuid('deleted_by').references(() => users.id),

    // Timestamps
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('matters_org_idx').on(table.organizationId),
    index('matters_customer_idx').on(table.customerId),
    index('matters_status_idx').on(table.status),
    index('matters_practice_area_idx').on(table.practiceAreaId),
    index('matters_deleted_at_idx').on(table.deletedAt),
    index('matters_created_at_idx').on(table.createdAt),
  ],
);

// Define relations
export const mattersRelations = relations(matters, ({ one }) => ({
  organization: one(organizations, {
    fields: [matters.organizationId],
    references: [organizations.id],
  }),
  customer: one(users, {
    fields: [matters.customerId],
    references: [users.id],
  }),
  practiceArea: one(practiceAreas, {
    fields: [matters.practiceAreaId],
    references: [practiceAreas.id],
  }),
  deletedByUser: one(users, {
    fields: [matters.deletedBy],
    references: [users.id],
    relationName: 'deletedBy',
  }),
}));

export type InsertMatter = typeof matters.$inferInsert;
export type SelectMatter = typeof matters.$inferSelect;
