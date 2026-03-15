import { z } from '@hono/zod-openapi';
import {
  createMatterExpenseRequestSchema,
  updateMatterExpenseRequestSchema,
  matterExpenseResponseSchema,
  listMatterExpensesQuerySchema,
} from '@/modules/matters/types/matter.types';
import { routeBuilder } from '@/shared/router/route-builder';

const tags = ['Matters'];

export const listExpensesRoute = routeBuilder.build({
  method: 'get',
  path: '/expenses',
  tags,
  summary: 'List expenses',
  request: {
    params: z.object({
      id: z.uuid(),
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
  path: '/expenses',
  tags,
  summary: 'Create an expense',
  request: {
    params: z.object({
      id: z.uuid(),
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
  path: '/expenses/{expense_id}',
  tags,
  summary: 'Update an expense',
  request: {
    params: z.object({
      id: z.uuid(),
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
  path: '/expenses/{expense_id}',
  tags,
  summary: 'Delete an expense',
  request: {
    params: z.object({
      id: z.uuid(),
      expense_id: z.uuid(),
    }),
  },
  responses: {
    200: {
      description: 'Expense deleted successfully',
      content: {
        'application/json': {
          schema: z.object({
            success: z.boolean(),
          }),
        },
      },
    },
  },
});
