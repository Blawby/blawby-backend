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
  path: '/{practice_id}/matters/{id}/expenses',
  tags,
  summary: 'List expenses',
  request: {
    params: z.object({
      practice_id: z.uuid(),
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
  path: '/{practice_id}/matters/{id}/expenses',
  tags,
  summary: 'Create an expense',
  request: {
    params: z.object({
      practice_id: z.uuid(),
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
  path: '/{practice_id}/matters/{id}/expenses/{expense_id}',
  tags,
  summary: 'Update an expense',
  request: {
    params: z.object({
      practice_id: z.uuid(),
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
  path: '/{practice_id}/matters/{id}/expenses/{expense_id}',
  tags,
  summary: 'Delete an expense',
  request: {
    params: z.object({
      practice_id: z.uuid(),
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
