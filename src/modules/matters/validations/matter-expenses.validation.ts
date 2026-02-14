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
  id: uuidValidator,
  expense_id: uuidValidator.openapi({
    param: { name: 'expense_id', in: 'path' },
    description: 'Expense ID (UUID)',
  }),
});

const listExpensesQuerySchema = z.object({
  expense_id: uuidValidator.optional(),
  billable: z.coerce.boolean().optional(),
  start_date: z.coerce.date().optional(),
  end_date: z.coerce.date().optional(),
});

const expenseSchema = z.object({
  id: z.uuid(),
  matter_id: z.uuid(),
  description: z.string(),
  amount: z.number().describe('Amount in cents'),
  date: z.string(),
  billable: z.boolean(),
  created_at: z.iso.datetime(),
  updated_at: z.iso.datetime(),
}).openapi('Expense');


export const matterExpenseValidations = {
  createMatterExpenseSchema,
  updateMatterExpenseSchema,
  matterExpenseIdParamSchema,
  listExpensesQuerySchema,
  expenseSchema,
};
