import { z } from '@hono/zod-openapi';
import { uuidValidator } from '@/shared/validations/common';

// Matter milestone validation schemas
const createMatterMilestoneSchema = z.object({
  description: z.string().min(1, 'Description is required'),
  amount: z.number().min(0, 'Amount must be non-negative'),
  dueDate: z.string(),
  status: z.enum(['pending', 'in_progress', 'completed', 'overdue']).default('pending'),
  order: z.number().int().min(0).default(0),
});

const updateMatterMilestoneSchema = z.object({
  description: z.string().min(1).optional(),
  amount: z.number().min(0).optional(),
  dueDate: z.string().optional(),
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
  uuid: uuidValidator,
  milestoneId: uuidValidator,
});

const milestoneSchema = z.object({
  id: z.uuid(),
  matterId: z.uuid(),
  description: z.string(),
  amount: z.number().describe('Amount in cents'),
  dueDate: z.string(),
  status: z.enum(['pending', 'in_progress', 'completed', 'overdue']),
  order: z.number(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
}).openapi('Milestone');



export const matterMilestoneValidations = {
  createMatterMilestoneSchema,
  updateMatterMilestoneSchema,
  reorderMilestonesSchema,
  matterMilestoneIdParamSchema,
  milestoneSchema,
};
