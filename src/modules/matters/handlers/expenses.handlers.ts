import {
  listExpensesRoute,
  createExpenseRoute,
  updateExpenseRoute,
  deleteExpenseRoute,
} from '@/modules/matters/routes';
import { matterExpensesService } from '@/modules/matters/services/matter-expenses.service';
import { AppRouteHandler } from '@/shared/types/hono';
import { response } from '@/shared/utils/responseUtils';

export const listExpensesHandler: AppRouteHandler<typeof listExpensesRoute> = async (c) => {
  const user = c.get('user')!;
  const { practice_id, id } = c.req.valid('param');
  const result = await matterExpensesService.listMatterExpenses(practice_id, id, user, c.req.header());
  
  if (result.success) {
    return response.ok(c, { expenses: result.data });
  }

  return response.fromResult(c, result);
};

export const createExpenseHandler: AppRouteHandler<typeof createExpenseRoute> = async (c) => {
  const user = c.get('user')!;
  const { practice_id, id } = c.req.valid('param');
  const validatedBody = c.req.valid('json');
  const result = await matterExpensesService
    .createMatterExpense(practice_id, id, validatedBody, user, c.req.header());

  if (result.success) {
    return response.created(c, { expense: result.data });
  }

  return response.fromResult(c, result, 201);
};

export const updateExpenseHandler: AppRouteHandler<typeof updateExpenseRoute> = async (c) => {
  const user = c.get('user')!;
  const { practice_id, id, expenseId } = c.req.valid('param');
  const validatedBody = c.req.valid('json');
  const result = await matterExpensesService.updateMatterExpense(
    practice_id,
    id,
    expenseId,
    validatedBody,
    user,
    c.req.header(),
  );

  if (result.success) {
    return response.ok(c, { expense: result.data });
  }

  return response.fromResult(c, result);
};

export const deleteExpenseHandler: AppRouteHandler<typeof deleteExpenseRoute> = async (c) => {
  const user = c.get('user')!;
  const { practice_id, id, expenseId } = c.req.valid('param');
  const result = await matterExpensesService.deleteMatterExpense(
    practice_id,
    id,
    expenseId,
    user,
    c.req.header(),
  );
  return response.fromResult(c, result);
};
