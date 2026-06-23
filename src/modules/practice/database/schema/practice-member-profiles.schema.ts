import { sql } from 'drizzle-orm';
import { pgTable, uuid, integer, boolean, text, timestamp, unique, check } from 'drizzle-orm/pg-core';

import { members } from '@/schema/better-auth-schema';

/**
 * Routing / capacity metadata for a practice member (typically an attorney).
 *
 * A dedicated 1:1 sub-resource so attorney routing fields stay out of the Better
 * Auth `members` table (which Better Auth owns). Keyed by `member_id` with a
 * cascade delete, so removing a member from the organization also removes their
 * routing profile.
 *
 * `current_matters` is intentionally NOT stored here — it is an attorney's live
 * active caseload, computed at read time from `matters` / `matter_assignees`.
 */
export const practiceMemberProfiles = pgTable(
  'practice_member_profiles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    member_id: uuid('member_id')
      .notNull()
      .references(() => members.id, { onDelete: 'cascade' }),

    // Routing metadata
    practice_areas: text('practice_areas')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    service_counties: text('service_counties')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    max_capacity: integer('max_capacity'), // null = no explicit cap on concurrent matters
    accepting_clients: boolean('accepting_clients').notNull().default(true),

    created_at: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    unique('practice_member_profiles_member_unique').on(table.member_id),
    check(
      'practice_member_profiles_max_capacity_non_negative',
      sql`${table.max_capacity} IS NULL OR ${table.max_capacity} >= 0`
    ),
  ]
);

export type InsertPracticeMemberProfile = typeof practiceMemberProfiles.$inferInsert;
export type SelectPracticeMemberProfile = typeof practiceMemberProfiles.$inferSelect;
