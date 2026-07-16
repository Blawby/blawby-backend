import { relations, sql } from 'drizzle-orm';
import { pgTable, uuid, text, boolean, integer, jsonb, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { organizations, users } from '@/schema/better-auth-schema';

export type IntakeTemplateStatus = 'draft' | 'published' | 'archived';
export type IntakeTemplateSuggestionStatus = 'staged' | 'approved' | 'dismissed';
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
    revision: integer('revision').notNull().default(1),
    published_at: timestamp('published_at', { withTimezone: true, mode: 'date' }),
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

export interface IntakeTemplateProposedEdit {
  operation: 'add' | 'remove' | 'reorder' | 'rephrase' | 'condition_change';
  field_key: string;
  field?: Record<string, unknown>;
  changes?: Record<string, unknown>;
}

export interface IntakeTemplateAnalyticsEvidence {
  status: 'available' | 'unavailable';
  window: { from: string; to: string } | null;
  numerator: number | null;
  denominator: number | null;
  provenance: string;
  reason: string | null;
}

export const intakeTemplateSuggestions = pgTable(
  'intake_template_suggestions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organization_id: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    template_id: uuid('template_id')
      .notNull()
      .references(() => intakeTemplates.id, { onDelete: 'cascade' }),
    request_key: uuid('request_key').notNull(),
    base_revision: integer('base_revision').notNull(),
    instruction: text('instruction').notNull(),
    proposed_edits: jsonb('proposed_edits').$type<IntakeTemplateProposedEdit[]>().notNull(),
    analytics_evidence: jsonb('analytics_evidence').$type<IntakeTemplateAnalyticsEvidence>().notNull(),
    status: text('status').notNull().default('staged').$type<IntakeTemplateSuggestionStatus>(),
    created_by: uuid('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    decided_by: uuid('decided_by').references(() => users.id, { onDelete: 'set null' }),
    applied_revision: integer('applied_revision'),
    created_at: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    decided_at: timestamp('decided_at', { withTimezone: true, mode: 'date' }),
  },
  (table) => [
    uniqueIndex('intake_template_suggestions_org_request_idx').on(table.organization_id, table.request_key),
    index('intake_template_suggestions_template_idx').on(table.template_id, table.created_at),
    index('intake_template_suggestions_status_idx').on(table.organization_id, table.status),
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
    options: jsonb('options').$type<{ value: string; label: string }[]>(),
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
  suggestions: many(intakeTemplateSuggestions),
}));

export const intakeTemplateFieldsRelations = relations(intakeTemplateFields, ({ one }) => ({
  template: one(intakeTemplates, {
    fields: [intakeTemplateFields.template_id],
    references: [intakeTemplates.id],
  }),
}));

export const intakeTemplateSuggestionsRelations = relations(intakeTemplateSuggestions, ({ one }) => ({
  template: one(intakeTemplates, {
    fields: [intakeTemplateSuggestions.template_id],
    references: [intakeTemplates.id],
  }),
  organization: one(organizations, {
    fields: [intakeTemplateSuggestions.organization_id],
    references: [organizations.id],
  }),
  creator: one(users, {
    fields: [intakeTemplateSuggestions.created_by],
    references: [users.id],
    relationName: 'intakeTemplateSuggestionCreator',
  }),
  decider: one(users, {
    fields: [intakeTemplateSuggestions.decided_by],
    references: [users.id],
    relationName: 'intakeTemplateSuggestionDecider',
  }),
}));

export type IntakeTemplate = typeof intakeTemplates.$inferSelect;
export type InsertIntakeTemplate = typeof intakeTemplates.$inferInsert;
export type IntakeTemplateField = typeof intakeTemplateFields.$inferSelect;
export type InsertIntakeTemplateField = typeof intakeTemplateFields.$inferInsert;
export type IntakeTemplateSuggestion = typeof intakeTemplateSuggestions.$inferSelect;
export type InsertIntakeTemplateSuggestion = typeof intakeTemplateSuggestions.$inferInsert;
