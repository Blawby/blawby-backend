import { ForbiddenError } from '@casl/ability';
import { HTTPException } from 'hono/http-exception';
import { matterExpensesQueries } from '@/modules/matters/database/queries/matter-expenses.queries';
import type { SelectMatterExpense } from '@/modules/matters/database/schema/matter-expenses.schema';
import { matterActivityService } from '@/modules/matters/services/matter-activity.service';
import { mattersService } from '@/modules/matters/services/matters.service';
import type { MatterExpenseListFilters } from '@/modules/matters/types/matter-filters.types';
import type { CreateMatterExpenseRequest, UpdateMatterExpenseRequest } from '@/modules/matters/types/matter.types';
import type { ServiceContext } from '@/shared/types/service-context';

/**
 * Create a matter expense
 */
const createMatterExpense = async (
  params: { data: CreateMatterExpenseRequest },
  ctx: ServiceContext
): Promise<SelectMatterExpense> => {
  const { matterId } = ctx;
  if (!matterId) throw new Error('Matter ID not found in context');

  ForbiddenError.from(ctx.ability).throwUnlessCan('update', 'Matter');
  await mattersService.verifyMatterAccess(matterId, ctx);

  const expense = await matterExpensesQueries.createMatterExpense({
    matter_id: matterId,
    user_id: ctx.userId,
    description: params.data.description,
    amount: params.data.amount,
    date: params.data.date,
    billable: params.data.billable,
  });

  const amountFormatted = (params.data.amount / 100).toFixed(2);
  const userName = ctx.user?.name || ctx.user?.email || 'Unknown User';
  await matterActivityService.logMatterActivity(
    {
      action: matterActivityService.ActivityAction.EXPENSE_ADDED,
      description: `${userName} added expense: ${params.data.description} ($${amountFormatted})${params.data.billable ? ' (billable)' : ''}`,
      metadata: {
        amount: params.data.amount,
        billable: params.data.billable,
        changed_fields: ['description', 'amount', 'date', 'billable'],
      },
    },
    ctx
  );

  return expense;
};

/**
 * List matter expenses
 */
const listMatterExpenses = async (
  params: { filters?: MatterExpenseListFilters },
  ctx: ServiceContext
): Promise<SelectMatterExpense[]> => {
  const { matterId } = ctx;
  if (!matterId) throw new Error('Matter ID not found in context');

  ForbiddenError.from(ctx.ability).throwUnlessCan('read', 'Matter');
  await mattersService.verifyMatterAccess(matterId, ctx);

  if (params.filters?.expenseId) {
    const expense = await matterExpensesQueries.findMatterExpenseById(params.filters.expenseId);
    if (!expense || expense.matter_id !== matterId) return [];
    return [expense];
  }

  return matterExpensesQueries.listMatterExpenses(matterId, params.filters);
};

/**
 * Update matter expense
 */
const updateMatterExpense = async (
  params: { expenseId: string; data: UpdateMatterExpenseRequest },
  ctx: ServiceContext
): Promise<SelectMatterExpense> => {
  const { matterId } = ctx;
  if (!matterId) throw new Error('Matter ID not found in context');

  ForbiddenError.from(ctx.ability).throwUnlessCan('update', 'Matter');
  await mattersService.verifyMatterAccess(matterId, ctx);

  const updated = await matterExpensesQueries.updateMatterExpense(params.expenseId, matterId, params.data);
  if (!updated) throw new HTTPException(404, { message: 'Expense not found' });

  const changedFields: string[] = [
    ...(params.data.description !== undefined ? ['description'] : []),
    ...(params.data.amount !== undefined ? ['amount'] : []),
    ...(params.data.date !== undefined ? ['date'] : []),
    ...(params.data.billable !== undefined ? ['billable'] : []),
  ];

  const userName = ctx.user?.name || ctx.user?.email || 'Unknown User';
  await matterActivityService.logMatterActivity(
    {
      action: matterActivityService.ActivityAction.EXPENSE_UPDATED,
      description: `${userName} updated an expense`,
      metadata: { changed_fields: changedFields },
    },
    ctx
  );

  return updated;
};

/**
 * Delete matter expense
 */
const deleteMatterExpense = async (params: { expenseId: string }, ctx: ServiceContext): Promise<void> => {
  const { matterId } = ctx;
  if (!matterId) throw new Error('Matter ID not found in context');

  ForbiddenError.from(ctx.ability).throwUnlessCan('update', 'Matter');
  await mattersService.verifyMatterAccess(matterId, ctx);

  const deleted = await matterExpensesQueries.deleteMatterExpense(params.expenseId, matterId);
  if (!deleted) throw new HTTPException(404, { message: 'Expense not found' });

  const userName = ctx.user?.name || ctx.user?.email || 'Unknown User';
  await matterActivityService.logMatterActivity(
    {
      action: matterActivityService.ActivityAction.EXPENSE_DELETED,
      description: `${userName} deleted an expense`,
      metadata: { changed_fields: ['deleted'] },
    },
    ctx
  );
};

/**
 * Get expense statistics
 */
const getExpenseStats = async (
  ctx: ServiceContext
): Promise<{
  totalBillableCents: number;
  totalCents: number;
  totalBillable: number;
  total: number;
}> => {
  const { matterId } = ctx;
  if (!matterId) throw new Error('Matter ID not found in context');

  ForbiddenError.from(ctx.ability).throwUnlessCan('read', 'Matter');
  await mattersService.verifyMatterAccess(matterId, ctx);

  const totalBillable = await matterExpensesQueries.getTotalBillableExpenses(matterId);
  const totalExpenses = await matterExpensesQueries.getTotalExpenses(matterId);

  return {
    totalBillableCents: totalBillable,
    totalCents: totalExpenses,
    totalBillable: totalBillable / 100,
    total: totalExpenses / 100,
  };
};

export const matterExpensesService = {
  createMatterExpense,
  listMatterExpenses,
  updateMatterExpense,
  deleteMatterExpense,
  getExpenseStats,
};
