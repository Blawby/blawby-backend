import { z } from '@hono/zod-openapi';
import {
  createMatterExpenseRequestSchema,
  updateMatterExpenseRequestSchema,
  matterExpenseResponseSchema,
  listMatterExpensesQuerySchema,
} from '@/modules/matters/types/matter.types';
import { matterExpensesService } from '@/modules/matters/services/matter-expenses.service';
import { routeBuilder } from '@/shared/router/route-builder';

const tags = ['Matters'];

export const listExpensesRoute = routeBuilder.build({
  method: 'get',
  path: '/{matter_id}/expenses',
  tags,
  summary: 'List expenses',
  mcp: {
    name: 'list_expenses',
    scope: 'matters:read',
    handler: async (args, ctx) => {
      const scopedCtx = { ...ctx, matterId: args.matter_id as string };
      return matterExpensesService.listMatterExpenses(
        {
          filters: {
            billable: args.billable as boolean | undefined,
            startDate: typeof args.start_date === 'string' ? new Date(args.start_date) : undefined,
            endDate: typeof args.end_date === 'string' ? new Date(args.end_date) : undefined,
            expenseId: args.expense_id as string | undefined,
          },
        },
        scopedCtx
      );
    },
  },
  request: {
    params: z.object({
      matter_id: z.uuid(),
    }),
    query: listMatterExpensesQuerySchema,
  },
  responses: {
    200: {
      description: 'Expenses retrieved successfully',
      content: {
        'application/json': {
          schema: z.array(matterExpenseResponseSchema),
        },
      },
    },
  },
});

export const createExpenseRoute = routeBuilder.build({
  method: 'post',
  path: '/{matter_id}/expenses',
  tags,
  summary: 'Create an expense',
  mcp: {
    name: 'create_expense',
    scope: 'matters:write',
    handler: async (args, ctx) => {
      const { matter_id, ...data } = args;
      const scopedCtx = { ...ctx, matterId: matter_id as string };
      return matterExpensesService.createMatterExpense(
        { data: data as Parameters<typeof matterExpensesService.createMatterExpense>[0]['data'] },
        scopedCtx
      );
    },
  },
  request: {
    params: z.object({
      matter_id: z.uuid(),
    }),
    body: {
      content: {
        'application/json': {
          schema: createMatterExpenseRequestSchema,
        },
      },
    },
  },
  responses: {
    201: {
      description: 'Expense created successfully',
      content: {
        'application/json': {
          schema: matterExpenseResponseSchema,
        },
      },
    },
  },
});

export const updateExpenseRoute = routeBuilder.build({
  method: 'put',
  path: '/{matter_id}/expenses/{expense_id}',
  tags,
  summary: 'Update an expense',
  mcp: {
    name: 'update_expense',
    scope: 'matters:write',
    handler: async (args, ctx) => {
      const { matter_id, expense_id, ...data } = args;
      const scopedCtx = { ...ctx, matterId: matter_id as string };
      return matterExpensesService.updateMatterExpense(
        {
          expenseId: expense_id as string,
          data: data as Parameters<typeof matterExpensesService.updateMatterExpense>[0]['data'],
        },
        scopedCtx
      );
    },
  },
  request: {
    params: z.object({
      matter_id: z.uuid(),
      expense_id: z.uuid(),
    }),
    body: {
      content: {
        'application/json': {
          schema: updateMatterExpenseRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Expense updated successfully',
      content: {
        'application/json': {
          schema: matterExpenseResponseSchema,
        },
      },
    },
  },
});

export const deleteExpenseRoute = routeBuilder.build({
  method: 'delete',
  path: '/{matter_id}/expenses/{expense_id}',
  tags,
  summary: 'Delete an expense',
  mcp: {
    name: 'delete_expense',
    scope: 'matters:write',
    handler: async (args, ctx) => {
      const scopedCtx = { ...ctx, matterId: args.matter_id as string };
      await matterExpensesService.deleteMatterExpense({ expenseId: args.expense_id as string }, scopedCtx);
      return { deleted: true };
    },
  },
  request: {
    params: z.object({
      matter_id: z.uuid(),
      expense_id: z.uuid(),
    }),
  },
  responses: {
    204: {
      description: 'Expense deleted successfully',
    },
  },
});
