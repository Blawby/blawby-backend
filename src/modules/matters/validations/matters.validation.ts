import { z } from '@hono/zod-openapi';
import { uuidValidator } from '@/shared/validations/common';

// Matter validation schemas
const createMatterSchema = z.object({
  practice_client_id: uuidValidator.optional(),
  title: z.string().min(1, 'Title is required').max(255, 'Title too long'),
  description: z.string().optional(),
  billing_type: z.enum(['hourly', 'fixed', 'contingency']),
  total_fixed_price: z.number().int().min(0).optional(), // in cents
  contingency_percentage: z.number().min(0).max(100).optional(),
  settlement_amount: z.number().int().min(0).optional(), // in cents
  practice_area_id: uuidValidator.optional(),
  admin_hourly_rate: z.number().int().min(0).optional(), // in cents
  attorney_hourly_rate: z.number().int().min(0).optional(), // in cents
  payment_frequency: z.enum(['project', 'milestone']).optional(),
  status: z.enum(['draft', 'active']).default('draft'),
  assignee_ids: z.array(uuidValidator).optional(), // User IDs to assign
  milestones: z.array(z.object({
    description: z.string().min(1).max(255),
    amount: z.number().int().min(0), // in cents
    due_date: z.string().or(z.date()),
    order: z.number().int().min(0).default(0),
  })).optional(),
}).refine(
  (data) => {
    // Use explicit undefined checks to allow 0 as a valid value
    if (data.billing_type === 'fixed' && data.total_fixed_price === undefined) {
      return false;
    }
    if (data.billing_type === 'contingency' && data.contingency_percentage === undefined) {
      return false;
    }
    if (data.billing_type === 'hourly' && data.admin_hourly_rate === undefined && data.attorney_hourly_rate === undefined) {
      return false;
    }
    return true;
  },
  {
    message: 'Invalid billing configuration for the selected billing type',
  },
);

const updateMatterSchema = z.object({
  practice_client_id: uuidValidator.optional(),
  title: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  billing_type: z.enum(['hourly', 'fixed', 'contingency']).optional(),
  total_fixed_price: z.number().int().min(0).optional(),
  contingency_percentage: z.number().min(0).max(100).optional(),
  settlement_amount: z.number().int().min(0).optional(),
  practice_area_id: uuidValidator.optional(),
  admin_hourly_rate: z.number().int().min(0).optional(),
  attorney_hourly_rate: z.number().int().min(0).optional(),
  payment_frequency: z.enum(['project', 'milestone']).optional(),
  status: z.enum(['draft', 'active']).optional(),
  assignee_ids: z.array(uuidValidator).optional(),
});

const matterIdParamSchema = z.object({
  uuid: uuidValidator,
});

const listMattersQuerySchema = z.object({
  status: z.enum(['draft', 'active']).optional(),
  practice_area_id: uuidValidator.optional(),
  practice_client_id: uuidValidator.optional(),
  assignee_id: uuidValidator.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
});

const matterSchema = z.object({
  id: z.uuid(),
  organization_id: z.uuid(),
  practice_client_id: z.uuid().nullable(),
  title: z.string(),
  description: z.string().nullable(),
  billing_type: z.enum(['hourly', 'fixed', 'contingency']),
  total_fixed_price: z.number().nullable(),
  contingency_percentage: z.number().nullable(),
  settlement_amount: z.number().nullable(),
  practice_area_id: z.uuid().nullable(),
  admin_hourly_rate: z.number().nullable(),
  attorney_hourly_rate: z.number().nullable(),
  payment_frequency: z.enum(['project', 'milestone']).nullable(),
  status: z.enum(['draft', 'active']),
  deleted_at: z.iso.datetime().nullable(),
  deleted_by: z.uuid().nullable(),
  created_at: z.iso.datetime(),
  updated_at: z.iso.datetime(),
}).openapi('Matter');

const activityLogSchema = z.object({
  id: z.uuid(),
  matter_id: z.uuid(),
  user_id: z.uuid().nullable(),
  action: z.string(),
  description: z.string(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
  created_at: z.iso.datetime(),
}).openapi('ActivityLog');



export const matterValidations = {
  createMatterSchema,
  updateMatterSchema,
  matterIdParamSchema,
  listMattersQuerySchema,
  matterSchema,
  activityLogSchema,
};
