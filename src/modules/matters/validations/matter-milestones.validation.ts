import { z } from 'zod';
import { uuidValidator } from '@/shared/validations/common';

// Matter milestone validation schemas
export const createMatterMilestoneSchema = z.object({
  description: z.string().min(1, 'Description is required').max(255, 'Description too long'),
  amount: z.number().int().min(0, 'Amount must be positive'), // in cents
  dueDate: z.string().or(z.date()),
  status: z.enum(['pending', 'in_progress', 'completed', 'overdue']).default('pending'),
  order: z.number().int().min(0).default(0),
});

export const updateMatterMilestoneSchema = z.object({
  description: z.string().min(1).max(255).optional(),
  amount: z.number().int().min(0).optional(),
  dueDate: z.string().or(z.date()).optional(),
  status: z.enum(['pending', 'in_progress', 'completed', 'overdue']).optional(),
  order: z.number().int().min(0).optional(),
});

export const reorderMilestonesSchema = z.object({
  milestones: z.array(z.object({
    id: uuidValidator,
    order: z.number().int().min(0),
  })).min(1, 'At least one milestone is required'),
});

export const matterMilestoneIdParamSchema = z.object({
  uuid: uuidValidator,
  milestoneId: uuidValidator,
});

// Infer types
export type CreateMatterMilestoneRequest = z.infer<typeof createMatterMilestoneSchema>;
export type UpdateMatterMilestoneRequest = z.infer<typeof updateMatterMilestoneSchema>;
export type ReorderMilestonesRequest = z.infer<typeof reorderMilestonesSchema>;
