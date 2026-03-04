import { z } from '@hono/zod-openapi';
import { uuidValidator } from '@/shared/validations/common';

// Matter milestone validation schemas
const createMatterMilestoneSchema = z.object({
  description: z.string().min(1, 'Description is required'),
  amount: z.number().min(0, 'Amount must be non-negative'),
  due_date: z.string(),
  status: z.enum(['pending', 'in_progress', 'completed', 'overdue']).default('pending'),
  order: z.number().int().min(0).default(0),
});

const updateMatterMilestoneSchema = z.object({
  description: z.string().min(1).optional(),
  amount: z.number().min(0).optional(),
  due_date: z.string().optional(),
  status: z.enum(['pending', 'in_progress', 'completed', 'overdue']).optional(),
  order: z.number().int().min(0).optional(),
}).refine(
  (data) => Object.keys(data).length > 0,
  { message: 'At least one field must be provided for update' },
);

const reorderMilestonesSchema = z.object({
  milestones: z.array(z.object({
    id: uuidValidator,
    order: z.number().int().min(0),
  })).min(1),
});

const matterMilestoneIdParamSchema = z.object({
  id: uuidValidator,
  milestone_id: uuidValidator.openapi({
    param: { name: 'milestone_id', in: 'path' },
    description: 'Milestone ID (UUID)',
  }),
});

const listMilestonesQuerySchema = z.object({
  milestone_id: uuidValidator.optional(),
});

const milestoneSchema = z.object({
  id: z.uuid(),
  matter_id: z.uuid(),
  description: z.string(),
  amount: z.number().describe('Amount in cents'),
  due_date: z.string(),
  status: z.enum(['pending', 'in_progress', 'completed', 'overdue']),
  order: z.number(),
  created_at: z.date(),
  updated_at: z.date(),
}).openapi('Milestone');


export const matterMilestoneValidations = {
  createMatterMilestoneSchema,
  updateMatterMilestoneSchema,
  reorderMilestonesSchema,
  matterMilestoneIdParamSchema,
  listMilestonesQuerySchema,
  milestoneSchema,
};
