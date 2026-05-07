import { z } from '@hono/zod-openapi';
import { uuidValidator } from '@/shared/validations/common';

const engagementContractStatusEnum = z.enum(['draft', 'sent', 'accepted', 'declined']);

const proposalDataSchema = z.object({
  client_summary: z
    .object({
      client_name: z.string(),
      matter_summary: z.string(),
      location_summary: z.string(),
      goals_summary: z.string(),
    })
    .optional(),
  representation: z
    .object({
      scope_summary: z.string(),
      included_services: z.array(z.string()),
      excluded_services: z.array(z.string()),
      client_identity_notes: z.string(),
      jurisdiction_notes: z.string(),
    })
    .optional(),
  fees: z
    .object({
      billing_type: z.string(),
      fixed_fee_amount: z.number().nullable().optional(),
      hourly_rate_attorney: z.number().nullable().optional(),
      hourly_rate_admin: z.number().nullable().optional(),
      contingency_percentage: z.number().nullable().optional(),
      retainer_amount: z.number().nullable().optional(),
      payment_frequency: z.string().nullable().optional(),
      fee_notes: z.string(),
    })
    .optional(),
  risk_review: z
    .object({
      conflict_status: z.enum(['unknown', 'clear', 'review_required', 'conflicted']),
      jurisdiction_status: z.enum(['unknown', 'supported', 'unsupported', 'review_required']),
      risk_notes: z.array(z.string()),
      open_questions: z.array(z.string()),
    })
    .optional(),
  source_snapshot: z
    .object({
      intake_uuid: z.string(),
      conversation_id: z.string(),
      matter_id: z.string(),
      practice_area: z.string(),
      urgency: z.string(),
      desired_outcome: z.string(),
      opposing_party: z.string(),
      court_date: z.string().nullable().optional(),
    })
    .optional(),
  draft_meta: z
    .object({
      generated_at: z.string(),
      generated_by: z.enum(['staff', 'ai']),
      version: z.number(),
    })
    .optional(),
});

const createEngagementContractSchema = z
  .object({
    intake_id: uuidValidator,
    contract_body: z.string().optional(),
    engagement_notes: z.string().optional(),
    proposal_data: proposalDataSchema.optional(),
  })
  .strict();

const updateEngagementContractSchema = z
  .object({
    contract_body: z.string().optional(),
    engagement_notes: z.string().optional(),
    proposal_data: proposalDataSchema.optional(),
  })
  .strict();

const engagementContractSchema = z
  .object({
    id: z.uuid(),
    intake_id: z.uuid(),
    matter_id: z.uuid().nullable(),
    organization_id: z.uuid(),
    status: engagementContractStatusEnum,
    contract_body: z.string().nullable(),
    billing_snapshot: z.record(z.string(), z.unknown()).nullable(),
    proposal_data: proposalDataSchema.nullable(),
    engagement_notes: z.string().nullable(),
    sent_at: z.date().nullable(),
    accepted_at: z.date().nullable(),
    declined_at: z.date().nullable(),
    signed_pdf_s3_key: z.string().nullable(),
    created_by: z.uuid().nullable(),
    created_at: z.date(),
    updated_at: z.date(),
  })
  .openapi('EngagementContract');

const listEngagementContractsQuerySchema = z.object({
  intake_id: uuidValidator.optional(),
  matter_id: uuidValidator.optional(),
  status: engagementContractStatusEnum.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const engagementContractIdParamSchema = z.object({
  id: z.uuid().openapi({ param: { name: 'id', in: 'path' } }),
});

const updateEngagementContractStatusSchema = z
  .object({
    status: z.enum(['sent', 'accepted', 'declined']),
  })
  .strict();

export const engagementContractValidations = {
  engagementContractStatusEnum,
  proposalDataSchema,
  createEngagementContractSchema,
  updateEngagementContractSchema,
  updateEngagementContractStatusSchema,
  engagementContractSchema,
  listEngagementContractsQuerySchema,
  engagementContractIdParamSchema,
};
