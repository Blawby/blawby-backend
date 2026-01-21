import { z } from 'zod';
import { uuidValidator } from '@/shared/validations/common';

// Matter expense validation schemas
export const createMatterExpenseSchema = z.object({
  description: z.string().min(1, 'Description is required').max(255, 'Description too long'),
  amount: z.number().int().min(0, 'Amount must be positive'), // in cents
  date: z.string().or(z.date()),
  billable: z.boolean().default(true),
});

export const updateMatterExpenseSchema = z.object({
  description: z.string().min(1).max(255).optional(),
  amount: z.number().int().min(0).optional(),
  date: z.string().or(z.date()).optional(),
  billable: z.boolean().optional(),
});

export const matterExpenseIdParamSchema = z.object({
  uuid: uuidValidator,
  expenseId: uuidValidator,
});

// Infer types
export type CreateMatterExpenseRequest = z.infer<typeof createMatterExpenseSchema>;
export type UpdateMatterExpenseRequest = z.infer<typeof updateMatterExpenseSchema>;
