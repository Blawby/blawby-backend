import { relations } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';

import { organizations } from '@/schema';

export const practiceAreas = pgTable(
  'practice_areas',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, {
        onDelete: 'cascade',
      }),
    name: varchar('name', { length: 100 }).notNull(),
    description: text('description'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('practice_areas_org_idx').on(table.organizationId),
    index('practice_areas_name_idx').on(table.name),
  ],
);

// Define relations
export const practiceAreasRelations = relations(practiceAreas, ({ one }) => ({
  organization: one(organizations, {
    fields: [practiceAreas.organizationId],
    references: [organizations.id],
  }),
}));

export type InsertPracticeArea = typeof practiceAreas.$inferInsert;
export type SelectPracticeArea = typeof practiceAreas.$inferSelect;
