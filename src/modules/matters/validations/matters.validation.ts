import { z } from '@hono/zod-openapi';
import { uuidValidator } from '@/shared/validations/common';

const matterStatusEnum = z.enum([
  'first_contact',
  'intake_pending',
  'conflict_check',
  'conflicted',
  'eligibility',
  'referred',
  'consultation_scheduled',
  'declined',
  'engagement_pending',
  'active',
  'pleadings_filed',
  'discovery',
  'mediation',
  'pre_trial',
  'trial',
  'order_entered',
  'appeal_pending',
  'closed',
]);

// Matter validation schemas
const createMatterSchema = z
  .object({
    client_id: uuidValidator.optional(),
    title: z.string().min(1, 'Title is required').max(255, 'Title too long'),
    description: z.string().optional(),
    case_number: z.string().max(100).optional(),
    matter_type: z.string().max(100).optional(),
    billing_type: z.enum(['hourly', 'fixed', 'contingency', 'pro_bono']),
    total_fixed_price: z.number().int().min(0).optional(), // in cents
    contingency_percentage: z.number().min(0).max(100).optional(),
    settlement_amount: z.number().int().min(0).optional(), // in cents
    practice_service_id: uuidValidator.optional(),
    admin_hourly_rate: z.number().int().min(0).optional(), // in cents
    attorney_hourly_rate: z.number().int().min(0).optional(), // in cents
    payment_frequency: z.enum(['project', 'milestone']).optional(),
    status: matterStatusEnum.default('first_contact'),
    urgency: z.enum(['routine', 'time_sensitive', 'emergency']).optional(),
    responsible_attorney_id: uuidValidator.optional(),
    originating_attorney_id: uuidValidator.optional(),
    court: z.string().max(255).optional(),
    judge: z.string().max(255).optional(),
    opposing_party: z.string().max(255).optional(),
    opposing_counsel: z.string().max(255).optional(),
    conversation_id: uuidValidator.optional(),
    intake_uuid: uuidValidator.optional(),
    on_behalf_of: z.string().optional(),
    open_date: z.iso.date().optional(),
    close_date: z.iso.date().optional(),
    assignee_ids: z.array(uuidValidator).optional(), // User IDs to assign
    retainer_low_balance_threshold: z.number().int().min(0).optional(), // Low balance threshold in cents
    milestones: z
      .array(
        z.object({
          description: z.string().min(1).max(255),
          amount: z.number().int().min(0), // in cents
          due_date: z.iso.date(),
          order: z.number().int().min(0).default(0),
        })
      )
      .optional(),
  })
  .refine(
    (data) => {
      // Use explicit undefined checks to allow 0 as a valid value
      if (data.billing_type === 'fixed' && data.total_fixed_price === undefined) {
        return false;
      }
      if (data.billing_type === 'contingency' && data.contingency_percentage === undefined) {
        return false;
      }
      if (
        data.billing_type === 'hourly' &&
        data.admin_hourly_rate === undefined &&
        data.attorney_hourly_rate === undefined
      ) {
        return false;
      }
      return true;
    },
    {
      message: 'Invalid billing configuration for the selected billing type',
    }
  )
  .strict();

const updateMatterSchema = z
  .object({
    client_id: uuidValidator.optional(),
    title: z.string().min(1).max(255).optional(),
    description: z.string().optional(),
    case_number: z.string().max(100).optional(),
    matter_type: z.string().max(100).optional(),
    billing_type: z.enum(['hourly', 'fixed', 'contingency', 'pro_bono']).optional(),
    total_fixed_price: z.number().int().min(0).optional(),
    contingency_percentage: z.number().min(0).max(100).optional(),
    settlement_amount: z.number().int().min(0).optional(),
    practice_service_id: uuidValidator.optional(),
    admin_hourly_rate: z.number().int().min(0).optional(),
    attorney_hourly_rate: z.number().int().min(0).optional(),
    payment_frequency: z.enum(['project', 'milestone']).optional(),
    status: matterStatusEnum.optional(),
    urgency: z.enum(['routine', 'time_sensitive', 'emergency']).optional(),
    responsible_attorney_id: uuidValidator.optional(),
    originating_attorney_id: uuidValidator.optional(),
    court: z.string().max(255).optional(),
    judge: z.string().max(255).optional(),
    opposing_party: z.string().max(255).optional(),
    opposing_counsel: z.string().max(255).optional(),
    conversation_id: uuidValidator.optional(),
    intake_uuid: uuidValidator.optional(),
    on_behalf_of: z.string().optional(),
    open_date: z.iso.date().optional(),
    close_date: z.iso.date().optional(),
    assignee_ids: z.array(uuidValidator).optional(),
    retainer_low_balance_threshold: z.number().int().min(0).nullable().optional(), // Low balance threshold in cents
  })
  .strict();

const matterIdParamSchema = z.object({
  id: uuidValidator.openapi({
    param: { name: 'id', in: 'path' },
    description: 'Matter ID (UUID)',
  }),
});

const listMattersQuerySchema = z.object({
  matter_id: uuidValidator.optional(),
  status: matterStatusEnum.optional(),
  practice_service_id: uuidValidator.optional(),
  client_id: uuidValidator.optional(),
  assignee_id: uuidValidator.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
});

const getActivityLogQuerySchema = z.object({
  activity_id: uuidValidator.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const matterSchema = z
  .object({
    id: z.uuid(),
    organization_id: z.uuid(),
    client_id: z.uuid().nullable(),
    title: z.string(),
    description: z.string().nullable(),
    case_number: z.string().nullable(),
    matter_type: z.string().nullable(),
    billing_type: z.enum(['hourly', 'fixed', 'contingency', 'pro_bono']),
    total_fixed_price: z.number().nullable(),
    contingency_percentage: z.number().nullable(),
    settlement_amount: z.number().nullable(),
    practice_service_id: z.uuid().nullable(),
    admin_hourly_rate: z.number().nullable(),
    attorney_hourly_rate: z.number().nullable(),
    payment_frequency: z.enum(['project', 'milestone']).nullable(),
    status: matterStatusEnum,
    urgency: z.enum(['routine', 'time_sensitive', 'emergency']).nullable(),
    responsible_attorney_id: z.uuid().nullable(),
    originating_attorney_id: z.uuid().nullable(),
    court: z.string().nullable(),
    judge: z.string().nullable(),
    opposing_party: z.string().nullable(),
    opposing_counsel: z.string().nullable(),
    conversation_id: z.uuid().nullable(),
    intake_uuid: z.uuid().nullable(),
    on_behalf_of: z.string().nullable(),
    open_date: z.date().nullable(),
    close_date: z.date().nullable(),
    deleted_at: z.date().nullable(),
    deleted_by: z.uuid().nullable(),
    created_at: z.date(),
    updated_at: z.date(),
    retainer_low_balance_threshold: z.number().nullable(),
    assignees: z.array(z.any()).optional(),
    milestones: z.array(z.any()).optional(),
  })
  .openapi('Matter');

const activityLogSchema = z
  .object({
    id: z.uuid(),
    matter_id: z.uuid(),
    user_id: z.uuid().nullable(),
    action: z.string(),
    description: z.string(),
    metadata: z
      .record(z.string(), z.unknown())
      .nullable()
      .openapi({
        description: 'Additional context for the activity. For updates, includes changed_fields: string[].',
        example: { changed_fields: ['status'], oldStatus: 'first_contact', newStatus: 'intake_pending' },
      }),
    created_at: z.date(),
  })
  .openapi('ActivityLog');

export const matterValidations = {
  matterStatusEnum,
  createMatterSchema,
  updateMatterSchema,
  matterIdParamSchema,
  listMattersQuerySchema,
  getActivityLogQuerySchema,
  matterSchema,
  activityLogSchema,
};
