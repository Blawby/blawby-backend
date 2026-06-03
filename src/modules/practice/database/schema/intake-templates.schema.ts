import { relations, sql } from 'drizzle-orm';
import { pgTable, uuid, text, boolean, integer, jsonb, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { organizations } from '@/schema/better-auth-schema';

export type IntakeTemplateStatus = 'draft' | 'published' | 'archived';
export type IntakeFieldPhase = 'required' | 'enrichment';
export type IntakeFieldType =
  | 'text'
  | 'textarea'
  | 'email'
  | 'phone'
  | 'select'
  | 'multiselect'
  | 'date'
  | 'boolean'
  | 'number';

export const intakeTemplates = pgTable(
  'intake_templates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organization_id: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    status: text('status').notNull().default('draft').$type<IntakeTemplateStatus>(),
    is_default: boolean('is_default').notNull().default(false),
    intro_message: text('intro_message'),
    legal_disclaimer: text('legal_disclaimer'),
    payment_link_enabled: boolean('payment_link_enabled').notNull().default(false),
    consultation_fee: integer('consultation_fee'),
    archived_at: timestamp('archived_at', { withTimezone: true, mode: 'date' }),
    created_at: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('intake_templates_org_slug_idx').on(table.organization_id, table.slug),
    index('intake_templates_org_idx').on(table.organization_id),
    index('intake_templates_status_idx').on(table.status),
    uniqueIndex('intake_templates_one_default_idx')
      .on(table.organization_id)
      .where(sql`${table.is_default} = true`),
  ]
);

export const intakeTemplateFields = pgTable(
  'intake_template_fields',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    template_id: uuid('template_id')
      .notNull()
      .references(() => intakeTemplates.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    label: text('label').notNull(),
    field_type: text('field_type').notNull().$type<IntakeFieldType>(),
    phase: text('phase').notNull().default('required').$type<IntakeFieldPhase>(),
    required: boolean('required').notNull().default(false),
    order_index: integer('order_index').notNull().default(0),
    placeholder: text('placeholder'),
    help_text: text('help_text'),
    prompt_hint: text('prompt_hint'),
    is_standard: boolean('is_standard').notNull().default(false),
    validation_rules: jsonb('validation_rules'),
    options: jsonb('options').$type<Array<{ value: string; label: string }>>(),
    created_at: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('intake_template_fields_template_key_idx').on(table.template_id, table.key),
    index('intake_template_fields_template_idx').on(table.template_id),
    index('intake_template_fields_order_idx').on(table.template_id, table.order_index),
  ]
);

export const intakeTemplatesRelations = relations(intakeTemplates, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [intakeTemplates.organization_id],
    references: [organizations.id],
  }),
  fields: many(intakeTemplateFields),
}));

export const intakeTemplateFieldsRelations = relations(intakeTemplateFields, ({ one }) => ({
  template: one(intakeTemplates, {
    fields: [intakeTemplateFields.template_id],
    references: [intakeTemplates.id],
  }),
}));

export type IntakeTemplate = typeof intakeTemplates.$inferSelect;
export type InsertIntakeTemplate = typeof intakeTemplates.$inferInsert;
export type IntakeTemplateField = typeof intakeTemplateFields.$inferSelect;
export type InsertIntakeTemplateField = typeof intakeTemplateFields.$inferInsert;
