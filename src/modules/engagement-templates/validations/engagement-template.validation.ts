import { z } from '@hono/zod-openapi';

const feeTypeEnum = z.enum(['hourly', 'flat', 'contingency', 'pro_bono']);

const engagementTemplateSchema = z
  .object({
    id: z.uuid(),
    practice_id: z.uuid(),
    name: z.string(),
    practice_area: z.string(),
    fee_type: feeTypeEnum,
    hourly_rate_cents: z.number().int().nullable(),
    flat_fee_cents: z.number().int().nullable(),
    contingency_pct: z.string().nullable(),
    retainer_cents: z.number().int().nullable(),
    scope_template: z.string(),
    body: z.string(),
    published_at: z.date().nullable(),
    version: z.number().int(),
    last_reviewed_at: z.date().nullable(),
    created_at: z.date(),
    updated_at: z.date(),
  })
  .openapi('EngagementTemplate');

const createEngagementTemplateSchema = z
  .object({
    name: z.string().min(1),
    practice_area: z.string().optional(),
    fee_type: feeTypeEnum.optional(),
    hourly_rate_cents: z.number().int().nullable().optional(),
    flat_fee_cents: z.number().int().nullable().optional(),
    contingency_pct: z.string().nullable().optional(),
    retainer_cents: z.number().int().nullable().optional(),
    scope_template: z.string().optional(),
    body: z.string().optional(),
    last_reviewed_at: z.iso.datetime({ offset: true }).nullable().optional(),
  })
  .strict();

const updateEngagementTemplateSchema = z
  .object({
    name: z.string().min(1).optional(),
    practice_area: z.string().optional(),
    fee_type: feeTypeEnum.optional(),
    hourly_rate_cents: z.number().int().nullable().optional(),
    flat_fee_cents: z.number().int().nullable().optional(),
    contingency_pct: z.string().nullable().optional(),
    retainer_cents: z.number().int().nullable().optional(),
    scope_template: z.string().optional(),
    body: z.string().optional(),
    last_reviewed_at: z.iso.datetime({ offset: true }).nullable().optional(),
  })
  .strict();

export const engagementTemplateValidations = {
  feeTypeEnum,
  engagementTemplateSchema,
  createEngagementTemplateSchema,
  updateEngagementTemplateSchema,
};
