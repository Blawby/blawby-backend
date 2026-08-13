import { sql } from 'drizzle-orm';
import { check, foreignKey, index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { stripeConnectedAccounts } from '@/modules/onboarding/schemas/onboarding.schema';
import { organizations } from '@/schema/better-auth-schema';

export const KRABICLAW_CONNECT_OPERATION_STATUSES = ['pending', 'succeeded', 'failed'] as const;
export type KrabiClawConnectOperationStatus = (typeof KRABICLAW_CONNECT_OPERATION_STATUSES)[number];

export const krabiclawConnectOperations = pgTable(
  'krabiclaw_connect_operations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organization_id: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    request_key: uuid('request_key').notNull(),
    status: text('status').notNull().default('pending').$type<KrabiClawConnectOperationStatus>(),
    connected_account_id: uuid('connected_account_id'),
    error_message: text('error_message'),
    created_at: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('krabiclaw_connect_operations_org_request_idx').on(table.organization_id, table.request_key),
    index('krabiclaw_connect_operations_status_idx').on(table.status),
    foreignKey({
      name: 'krabiclaw_connect_operations_connected_account_org_fk',
      columns: [table.connected_account_id, table.organization_id],
      foreignColumns: [stripeConnectedAccounts.id, stripeConnectedAccounts.organization_id],
    }),
    check('krabiclaw_connect_operations_status_check', sql`${table.status} IN ('pending', 'succeeded', 'failed')`),
  ]
);

export type InsertKrabiClawConnectOperation = typeof krabiclawConnectOperations.$inferInsert;
export type SelectKrabiClawConnectOperation = typeof krabiclawConnectOperations.$inferSelect;
