import { z } from '@hono/zod-openapi';

const intakeFieldTypeSchema = z.enum([
  'text',
  'textarea',
  'email',
  'phone',
  'select',
  'multiselect',
  'date',
  'boolean',
  'number',
]);
const intakeFieldPhaseSchema = z.enum(['required', 'enrichment']);
const intakeTemplateStatusSchema = z.enum(['draft', 'published', 'archived']);

const intakeTemplateFieldSchema = z
  .object({
    id: z.uuid(),
    template_id: z.uuid(),
    key: z.string().min(1).max(100),
    label: z.string().min(1).max(200),
    field_type: intakeFieldTypeSchema,
    phase: intakeFieldPhaseSchema,
    required: z.boolean(),
    order_index: z.number().int().min(0),
    placeholder: z.string().nullable(),
    help_text: z.string().nullable(),
    prompt_hint: z.string().nullable(),
    is_standard: z.boolean(),
    validation_rules: z.unknown().nullable(),
    options: z.array(z.object({ value: z.string(), label: z.string() })).nullable(),
    created_at: z.iso.datetime(),
    updated_at: z.iso.datetime(),
  })
  .openapi('IntakeTemplateField');

const intakeTemplateSchema = z
  .object({
    id: z.uuid(),
    organization_id: z.uuid(),
    slug: z.string().min(1).max(100),
    name: z.string().min(1).max(200),
    description: z.string().nullable(),
    status: intakeTemplateStatusSchema,
    revision: z.number().int().positive(),
    published_at: z.iso.datetime().nullable(),
    is_default: z.boolean(),
    intro_message: z.string().nullable(),
    legal_disclaimer: z.string().nullable(),
    payment_link_enabled: z.boolean(),
    consultation_fee: z.number().int().nullable(),
    archived_at: z.iso.datetime().nullable(),
    created_at: z.iso.datetime(),
    updated_at: z.iso.datetime(),
    fields: z.array(intakeTemplateFieldSchema),
  })
  .openapi('IntakeTemplate');

const createIntakeTemplateFieldSchema = z.object({
  key: z.string().min(1).max(100),
  label: z.string().min(1).max(200),
  field_type: intakeFieldTypeSchema,
  phase: intakeFieldPhaseSchema.default('required'),
  required: z.boolean().default(false),
  order_index: z.number().int().min(0).optional(),
  placeholder: z.string().optional(),
  help_text: z.string().optional(),
  prompt_hint: z.string().optional(),
  is_standard: z.boolean().default(false),
  validation_rules: z.record(z.string(), z.unknown()).optional(),
  options: z.array(z.object({ value: z.string(), label: z.string() })).optional(),
});

const createIntakeTemplateSchema = z
  .object({
    slug: z
      .string()
      .min(1)
      .max(100)
      .regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens'),
    name: z.string().min(1).max(200),
    description: z.string().optional(),
    status: intakeTemplateStatusSchema.default('draft'),
    is_default: z.boolean().default(false),
    intro_message: z.string().optional(),
    legal_disclaimer: z.string().optional(),
    payment_link_enabled: z.boolean().default(false),
    consultation_fee: z.number().int().min(0).optional(),
    fields: z.array(createIntakeTemplateFieldSchema).default([]),
  })
  .openapi('CreateIntakeTemplate');

const updateIntakeTemplateSchema = z
  .object({
    expected_revision: z.number().int().positive(),
    slug: z
      .string()
      .min(1)
      .max(100)
      .regex(/^[a-z0-9-]+$/)
      .optional(),
    name: z.string().min(1).max(200).optional(),
    description: z.string().nullable().optional(),
    status: intakeTemplateStatusSchema.optional(),
    is_default: z.boolean().optional(),
    intro_message: z.string().nullable().optional(),
    legal_disclaimer: z.string().nullable().optional(),
    payment_link_enabled: z.boolean().optional(),
    consultation_fee: z.number().int().min(0).nullable().optional(),
    fields: z.array(createIntakeTemplateFieldSchema).optional(),
  })
  .openapi('UpdateIntakeTemplate');

const addFieldSuggestionSchema = z.object({
  operation: z.literal('add'),
  field_key: z.string().min(1).max(100),
  field: createIntakeTemplateFieldSchema,
});

const removeFieldSuggestionSchema = z.object({
  operation: z.literal('remove'),
  field_key: z.string().min(1).max(100),
});

const reorderFieldSuggestionSchema = z.object({
  operation: z.literal('reorder'),
  field_key: z.string().min(1).max(100),
  changes: z.object({ order_index: z.number().int().min(0) }),
});

const rephraseFieldSuggestionSchema = z.object({
  operation: z.literal('rephrase'),
  field_key: z.string().min(1).max(100),
  changes: z
    .object({
      label: z.string().min(1).max(200).optional(),
      placeholder: z.string().nullable().optional(),
      help_text: z.string().nullable().optional(),
      prompt_hint: z.string().nullable().optional(),
    })
    .refine((changes) => Object.keys(changes).length > 0, 'At least one text change is required'),
});

const conditionChangeSuggestionSchema = z.object({
  operation: z.literal('condition_change'),
  field_key: z.string().min(1).max(100),
  changes: z
    .object({
      required: z.boolean().optional(),
      phase: intakeFieldPhaseSchema.optional(),
      validation_rules: z.record(z.string(), z.unknown()).nullable().optional(),
    })
    .refine((changes) => Object.keys(changes).length > 0, 'At least one condition change is required'),
});

const intakeTemplateProposedEditSchema = z.discriminatedUnion('operation', [
  addFieldSuggestionSchema,
  removeFieldSuggestionSchema,
  reorderFieldSuggestionSchema,
  rephraseFieldSuggestionSchema,
  conditionChangeSuggestionSchema,
]);

const createIntakeTemplateSuggestionSchema = z.object({
  request_key: z.uuid(),
  base_revision: z.number().int().positive(),
  instruction: z.string().trim().min(1).max(4000),
  proposed_edits: z.array(intakeTemplateProposedEditSchema).min(1).max(50),
});

const decideIntakeTemplateSuggestionSchema = z.object({
  expected_revision: z.number().int().positive(),
});

const analyticsEvidenceSchema = z.object({
  status: z.enum(['available', 'unavailable']),
  window: z.object({ from: z.iso.datetime(), to: z.iso.datetime() }).nullable(),
  numerator: z.number().int().nonnegative().nullable(),
  denominator: z.number().int().nonnegative().nullable(),
  provenance: z.string().min(1),
  reason: z.string().nullable(),
});

const intakeTemplateSuggestionSchema = z.object({
  id: z.uuid(),
  organization_id: z.uuid(),
  template_id: z.uuid(),
  request_key: z.uuid(),
  base_revision: z.number().int().positive(),
  instruction: z.string(),
  proposed_edits: z.array(intakeTemplateProposedEditSchema),
  analytics_evidence: analyticsEvidenceSchema,
  status: z.enum(['staged', 'approved', 'dismissed']),
  created_by: z.uuid(),
  decided_by: z.uuid().nullable(),
  applied_revision: z.number().int().positive().nullable(),
  created_at: z.iso.datetime(),
  decided_at: z.iso.datetime().nullable(),
});

const intakeTemplateSingleResponseSchema = z
  .object({ template: intakeTemplateSchema })
  .openapi('IntakeTemplateSingleResponse');

const intakeTemplateListResponseSchema = z
  .object({ templates: z.array(intakeTemplateSchema) })
  .openapi('IntakeTemplateListResponse');

const practiceIdParamSchema = z.object({
  practice_id: z.uuid().openapi({ param: { name: 'practice_id', in: 'path' } }),
});

const templateIdParamSchema = z.object({
  practice_id: z.uuid().openapi({ param: { name: 'practice_id', in: 'path' } }),
  id: z.uuid().openapi({ param: { name: 'id', in: 'path' } }),
});

export const intakeTemplateValidations = {
  intakeTemplateSchema,
  intakeTemplateFieldSchema,
  createIntakeTemplateSchema,
  updateIntakeTemplateSchema,
  intakeTemplateSingleResponseSchema,
  intakeTemplateListResponseSchema,
  practiceIdParamSchema,
  templateIdParamSchema,
  intakeTemplateProposedEditSchema,
  createIntakeTemplateSuggestionSchema,
  decideIntakeTemplateSuggestionSchema,
  intakeTemplateSuggestionSchema,
  analyticsEvidenceSchema,
};

export type CreateIntakeTemplateRequest = z.infer<typeof createIntakeTemplateSchema>;
export type UpdateIntakeTemplateRequest = z.infer<typeof updateIntakeTemplateSchema>;
export type IntakeTemplateResponse = z.infer<typeof intakeTemplateSchema>;
export type IntakeTemplateFieldResponse = z.infer<typeof intakeTemplateFieldSchema>;
export type IntakeTemplateProposedEdit = z.infer<typeof intakeTemplateProposedEditSchema>;
export type CreateIntakeTemplateSuggestionRequest = z.infer<typeof createIntakeTemplateSuggestionSchema>;
export type DecideIntakeTemplateSuggestionRequest = z.infer<typeof decideIntakeTemplateSuggestionSchema>;
export type IntakeTemplateSuggestionResponse = z.infer<typeof intakeTemplateSuggestionSchema>;
