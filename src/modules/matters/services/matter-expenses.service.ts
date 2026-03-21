import { getLogger } from '@logtape/logtape';
import { matterExpensesQueries } from '@/modules/matters/database/queries/matter-expenses.queries';
import type { SelectMatterExpense } from '@/modules/matters/database/schema/matter-expenses.schema';
import { matterActivityService } from '@/modules/matters/services/matter-activity.service';
import { mattersService } from '@/modules/matters/services/matters.service';
import type { MatterExpenseListFilters } from '@/modules/matters/types/matter-filters.types';
import type { CreateMatterExpenseRequest, UpdateMatterExpenseRequest } from '@/modules/matters/types/matter.types';
import type { Result } from '@/shared/types/result';
import type { ServiceContext } from '@/shared/types/service-context';
import { ok, internalError, notFound, forbidden } from '@/shared/utils/result';

const logger = getLogger(['matters', 'services', 'expenses']);

/**
 * Create a matter expense
 */
const createMatterExpense = async (
  params: { data: CreateMatterExpenseRequest },
  ctx: ServiceContext
): Promise<Result<SelectMatterExpense>> => {
  const matterId = ctx.matterId;
  if (!matterId) {
    return internalError('Matter ID not found in context');
  }

  // CASL Check
  if (ctx.ability.cannot('update', 'Matter')) {
    return forbidden('You do not have permission to update this matter');
  }

  // Verify user has access to matter
  const matterResult = await mattersService.verifyMatterAccess(matterId, ctx);
  if (!matterResult.success) {
    return matterResult;
  }

  try {
    const expense = await matterExpensesQueries.createMatterExpense({
      matter_id: matterId,
      user_id: ctx.userId,
      description: params.data.description,
      amount: params.data.amount,
      date: params.data.date,
      billable: params.data.billable,
    });
    const changedFields = ['description', 'amount', 'date', 'billable'];

    // Log activity
    const amountFormatted = (params.data.amount / 100).toFixed(2);
    const userName = ctx.user?.name || ctx.user?.email || 'Unknown User';
    const activityResult = await matterActivityService.logMatterActivity(
      {
        action: matterActivityService.ActivityAction.EXPENSE_ADDED,
        description: `${userName} added expense: ${params.data.description} ($${amountFormatted})${params.data.billable ? ' (billable)' : ''}`,
        metadata: { amount: params.data.amount, billable: params.data.billable, changed_fields: changedFields },
      },
      ctx
    );
    if (!activityResult.success) {
      logger.error('Failed to log expense create activity {matterId}: {error}', {
        matterId,
        error: activityResult.error.message,
      });
    }

    return ok(expense);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to create matter expense {matterId}: {error}', {
      matterId,
      error: message,
    });
    return internalError(message);
  }
};

/**
 * List matter expenses
 */
const listMatterExpenses = async (
  params: { filters?: MatterExpenseListFilters },
  ctx: ServiceContext
): Promise<Result<SelectMatterExpense[]>> => {
  const matterId = ctx.matterId;
  if (!matterId) {
    return internalError('Matter ID not found in context');
  }

  // CASL Check
  if (ctx.ability.cannot('read', 'Matter')) {
    return forbidden('You do not have permission to read this matter');
  }

  // Verify user has access to matter
  const matterResult = await mattersService.verifyMatterAccess(matterId, ctx);
  if (!matterResult.success) {
    return matterResult;
  }

  try {
    // Short-circuit: direct lookup when a specific expense ID is provided.
    // When expenseId is set, other filters (billable, startDate, endDate) are
    // intentionally ignored — this path is for single-resource retrieval.
    if (params.filters?.expenseId) {
      const expense = await matterExpensesQueries.findMatterExpenseById(params.filters.expenseId);
      if (!expense || expense.matter_id !== matterId) return ok([]);
      return ok([expense]);
    }

    const expenses = await matterExpensesQueries.listMatterExpenses(matterId, params.filters);
    return ok(expenses);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to list matter expenses {matterId}: {error}', {
      matterId,
      error: message,
    });
    return internalError(message);
  }
};

/**
 * Update matter expense
 */
const updateMatterExpense = async (
  params: { expenseId: string; data: UpdateMatterExpenseRequest },
  ctx: ServiceContext
): Promise<Result<SelectMatterExpense>> => {
  const matterId = ctx.matterId;
  if (!matterId) {
    return internalError('Matter ID not found in context');
  }

  // CASL Check
  if (ctx.ability.cannot('update', 'Matter')) {
    return forbidden('You do not have permission to update this matter');
  }

  // Verify user has access to matter
  const matterResult = await mattersService.verifyMatterAccess(matterId, ctx);
  if (!matterResult.success) {
    return matterResult;
  }

  try {
    const updated = await matterExpensesQueries.updateMatterExpense(params.expenseId, matterId, params.data);
    if (!updated) {
      return notFound('Expense not found');
    }
    const changedFields: string[] = [
      ...(params.data.description !== undefined ? ['description'] : []),
      ...(params.data.amount !== undefined ? ['amount'] : []),
      ...(params.data.date !== undefined ? ['date'] : []),
      ...(params.data.billable !== undefined ? ['billable'] : []),
    ];

    // Log activity
    const userName = ctx.user?.name || ctx.user?.email || 'Unknown User';
    const activityResult = await matterActivityService.logMatterActivity(
      {
        action: matterActivityService.ActivityAction.EXPENSE_UPDATED,
        description: `${userName} updated an expense`,
        metadata: { changed_fields: changedFields },
      },
      ctx
    );
    if (!activityResult.success) {
      logger.error('Failed to log expense update activity {expenseId}: {error}', {
        expenseId: params.expenseId,
        error: activityResult.error.message,
      });
    }

    return ok(updated);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to update matter expense {expenseId}: {error}', {
      expenseId: params.expenseId,
      error: message,
    });
    return internalError(message);
  }
};

/**
 * Delete matter expense
 */
const deleteMatterExpense = async (
  params: { expenseId: string },
  ctx: ServiceContext
): Promise<Result<{ success: true }>> => {
  const matterId = ctx.matterId;
  if (!matterId) {
    return internalError('Matter ID not found in context');
  }

  // CASL Check
  if (ctx.ability.cannot('update', 'Matter')) {
    return forbidden('You do not have permission to update this matter');
  }

  // Verify user has access to matter
  const matterResult = await mattersService.verifyMatterAccess(matterId, ctx);
  if (!matterResult.success) {
    return matterResult;
  }

  try {
    const deleted = await matterExpensesQueries.deleteMatterExpense(params.expenseId, matterId);
    if (!deleted) {
      return notFound('Expense not found');
    }

    // Log activity
    const userName = ctx.user?.name || ctx.user?.email || 'Unknown User';
    const activityResult = await matterActivityService.logMatterActivity(
      {
        action: matterActivityService.ActivityAction.EXPENSE_DELETED,
        description: `${userName} deleted an expense`,
        metadata: { changed_fields: ['deleted'] },
      },
      ctx
    );
    if (!activityResult.success) {
      logger.error('Failed to log expense delete activity {expenseId}: {error}', {
        expenseId: params.expenseId,
        error: activityResult.error.message,
      });
    }

    return ok({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to delete matter expense {expenseId}: {error}', {
      expenseId: params.expenseId,
      error: message,
    });
    return internalError(message);
  }
};

/**
 * Get expense statistics
 */
const getExpenseStats = async (
  ctx: ServiceContext
): Promise<
  Result<{
    totalBillableCents: number;
    totalCents: number;
    totalBillable: number;
    total: number;
  }>
> => {
  const matterId = ctx.matterId;
  if (!matterId) {
    return internalError('Matter ID not found in context');
  }

  // CASL Check
  if (ctx.ability.cannot('read', 'Matter')) {
    return forbidden('You do not have permission to read this matter');
  }

  // Verify user has access to matter
  const matterResult = await mattersService.verifyMatterAccess(matterId, ctx);
  if (!matterResult.success) {
    return matterResult;
  }

  try {
    const totalBillable = await matterExpensesQueries.getTotalBillableExpenses(matterId);
    const totalExpenses = await matterExpensesQueries.getTotalExpenses(matterId);

    return ok({
      totalBillableCents: totalBillable,
      totalCents: totalExpenses,
      totalBillable: totalBillable / 100,
      total: totalExpenses / 100,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to get expense stats {matterId}: {error}', {
      matterId,
      error: message,
    });
    return internalError(message);
  }
};

export const matterExpensesService = {
  createMatterExpense,
  listMatterExpenses,
  updateMatterExpense,
  deleteMatterExpense,
  getExpenseStats,
};
