import { pgTable, uuid, varchar, text, jsonb, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { organizations, users } from '@/schema/better-auth-schema';
import { matters } from '@/modules/matters/database/schema/matters.schema';
import type { EngagementContractStatus, ProposalData } from '@/modules/engagement-contracts/types/proposal-data.types';

export const engagementContracts = pgTable(
  'engagement_contracts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    matter_id: uuid('matter_id')
      .notNull()
      .references(() => matters.id, {
        onDelete: 'cascade',
      }),
    organization_id: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, {
        onDelete: 'cascade',
      }),
    status: varchar('status', { length: 20 }).notNull().$type<EngagementContractStatus>().default('draft'),
    contract_body: text('contract_body'),
    billing_snapshot: jsonb('billing_snapshot'),
    proposal_data: jsonb('proposal_data').$type<ProposalData>(),
    engagement_notes: text('engagement_notes'),
    sent_at: timestamp('sent_at', { withTimezone: true, mode: 'date' }),
    accepted_at: timestamp('accepted_at', { withTimezone: true, mode: 'date' }),
    declined_at: timestamp('declined_at', { withTimezone: true, mode: 'date' }),
    signed_pdf_s3_key: text('signed_pdf_s3_key'),
    created_by: uuid('created_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    created_at: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    index('engagement_contracts_matter_idx').on(table.matter_id),
    index('engagement_contracts_org_idx').on(table.organization_id),
    index('engagement_contracts_status_idx').on(table.status),
    index('engagement_contracts_created_at_idx').on(table.created_at),
    uniqueIndex('engagement_contracts_unique_accepted_per_matter_idx')
      .on(table.matter_id)
      .where(sql`${table.status} = 'accepted'`),
  ]
);

export type InsertEngagementContract = typeof engagementContracts.$inferInsert;
export type SelectEngagementContract = typeof engagementContracts.$inferSelect;
