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

import { practiceClientsSchema } from '@/modules/clients/database/schema/practice-clients.schema';
import { matterAssignees } from '@/modules/matters/database/schema/matter-assignees.schema';
import { matterMilestones } from '@/modules/matters/database/schema/matter-milestones.schema';
import { practiceServices } from '@/modules/practice/database/schema/practice.schema';
import { organizations, users } from '@/schema';

const { practiceClients } = practiceClientsSchema;

export const matters = pgTable(
  'matters',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organization_id: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, {
        onDelete: 'cascade',
      }),
    practice_client_id: uuid('practice_client_id').references(() => practiceClients.id, {
      onDelete: 'set null',
    }),
    title: varchar('title', { length: 255 }).notNull(),
    description: text('description'),

    // Billing information
    billing_type: varchar('billing_type', { length: 20 }).notNull(), // 'hourly', 'fixed', 'contingency'
    total_fixed_price: integer('total_fixed_price'), // in cents, nullable
    contingency_percentage: real('contingency_percentage'), // float, nullable
    settlement_amount: integer('settlement_amount'), // in cents, nullable

    // Service/Practice area reference
    practice_service_id: uuid('practice_service_id').references(() => practiceServices.id, {
      onDelete: 'set null',
    }),

    // Hourly rates
    admin_hourly_rate: integer('admin_hourly_rate'), // in cents, nullable
    attorney_hourly_rate: integer('attorney_hourly_rate'), // in cents, nullable

    // Payment settings
    payment_frequency: varchar('payment_frequency', { length: 20 }), // 'project', 'milestone', nullable

    // Status
    status: varchar('status', { length: 20 }).notNull().default('draft'), // 'draft', 'active'

    // Soft delete
    deleted_at: timestamp('deleted_at', { withTimezone: true, mode: 'date' }),
    deleted_by: uuid('deleted_by').references(() => users.id),

    // Timestamps
    created_at: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('matters_org_idx').on(table.organization_id),
    index('matters_client_idx').on(table.practice_client_id),
    index('matters_status_idx').on(table.status),
    index('matters_practice_service_idx').on(table.practice_service_id),
    index('matters_deleted_at_idx').on(table.deleted_at),
    index('matters_created_at_idx').on(table.created_at),
  ],
);

// Define relations
export const mattersRelations = relations(matters, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [matters.organization_id],
    references: [organizations.id],
  }),
  practiceClient: one(practiceClients, {
    fields: [matters.practice_client_id],
    references: [practiceClients.id],
  }),
  practiceService: one(practiceServices, {
    fields: [matters.practice_service_id],
    references: [practiceServices.id],
  }),
  deletedByUser: one(users, {
    fields: [matters.deleted_by],
    references: [users.id],
    relationName: 'deletedBy',
  }),
  assignees: many(matterAssignees),
  milestones: many(matterMilestones),
}));

export type InsertMatter = typeof matters.$inferInsert;
export type SelectMatter = typeof matters.$inferSelect;
