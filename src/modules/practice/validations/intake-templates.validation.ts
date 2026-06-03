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
    created_at: z.string().datetime(),
    updated_at: z.string().datetime(),
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
    is_default: z.boolean(),
    intro_message: z.string().nullable(),
    legal_disclaimer: z.string().nullable(),
    payment_link_enabled: z.boolean(),
    consultation_fee: z.number().int().nullable(),
    archived_at: z.string().datetime().nullable(),
    created_at: z.string().datetime(),
    updated_at: z.string().datetime(),
    fields: z.array(intakeTemplateFieldSchema),
  })
  .openapi('IntakeTemplate');

const createIntakeTemplateFieldSchema = z.object({
  key: z.string().min(1).max(100),
  label: z.string().min(1).max(200),
  field_type: intakeFieldTypeSchema,
  phase: intakeFieldPhaseSchema.default('required'),
  required: z.boolean().default(false),
  order_index: z.number().int().min(0).default(0),
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
};

export type CreateIntakeTemplateRequest = z.infer<typeof createIntakeTemplateSchema>;
export type UpdateIntakeTemplateRequest = z.infer<typeof updateIntakeTemplateSchema>;
export type IntakeTemplateResponse = z.infer<typeof intakeTemplateSchema>;
export type IntakeTemplateFieldResponse = z.infer<typeof intakeTemplateFieldSchema>;
