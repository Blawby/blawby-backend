import { z } from '@hono/zod-openapi';
import { uuidValidator } from '@/shared/validations/common';

// Matter expense validation schemas
const createMatterExpenseSchema = z.object({
  description: z.string().min(1, 'Description is required'),
  amount: z.number().min(0, 'Amount must be non-negative'),
  date: z.string(),
  billable: z.boolean().default(true),
});

const updateMatterExpenseSchema = z.object({
  description: z.string().min(1).optional(),
  amount: z.number().min(0).optional(),
  date: z.string().optional(),
  billable: z.boolean().optional(),
}).refine(
  (data) => Object.keys(data).length > 0,
  { message: 'At least one field must be provided for update' },
);

const matterExpenseIdParamSchema = z.object({
  uuid: uuidValidator,
  expenseId: uuidValidator,
});

const expenseSchema = z.object({
  id: z.uuid(),
  matterId: z.uuid(),
  description: z.string(),
  amount: z.number().describe('Amount in cents'),
  date: z.string(),
  billable: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
}).openapi('Expense');



export const matterExpenseValidations = {
  createMatterExpenseSchema,
  updateMatterExpenseSchema,
  matterExpenseIdParamSchema,
  expenseSchema,
};
