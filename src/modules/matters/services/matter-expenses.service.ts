import { getLogger } from '@logtape/logtape';
import { matterExpensesQueries } from '@/modules/matters/database/queries/matter-expenses.queries';
import type { SelectMatterExpense } from '@/modules/matters/database/schema/matter-expenses.schema';
import { matterActivityService } from '@/modules/matters/services/matter-activity.service';
import { mattersService } from '@/modules/matters/services/matters.service';
import type {
  CreateMatterExpenseRequest,
  UpdateMatterExpenseRequest,
} from '@/modules/matters/types/matter.types';
import type { User } from '@/shared/types/BetterAuth';
import type { Result } from '@/shared/types/result';
import { ok, internalError, notFound } from '@/shared/utils/result';

const logger = getLogger(['matters', 'services', 'expenses']);

/**
 * Create a matter expense
 */
const createMatterExpense = async (
  organizationId: string,
  matterId: string,
  data: CreateMatterExpenseRequest,
  user: User,
  requestHeaders: Record<string, string>,
): Promise<Result<SelectMatterExpense>> => {
  // Verify user has access to matter
  const matterResult = await mattersService.getMatterById(organizationId, matterId, user, requestHeaders);
  if (!matterResult.success) {
    return matterResult;
  }

  try {
    const expense = await matterExpensesQueries.createMatterExpense({
      matter_id: matterId,
      user_id: user.id,
      description: data.description,
      amount: data.amount,
      date: data.date,
      billable: data.billable,
    });

    // Log activity
    const amountFormatted = (data.amount / 100).toFixed(2);
    await matterActivityService.logMatterActivity(
      matterId,
      matterActivityService.ActivityAction.EXPENSE_ADDED,
      `${user.name || user.email} added expense: ${data.description} ($${amountFormatted})${data.billable ? ' (billable)' : ''}`,
      user.id,
      { amount: data.amount, billable: data.billable },
    );

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
  organizationId: string,
  matterId: string,
  user: User,
  requestHeaders: Record<string, string>,
  filters?: {
    billable?: boolean;
    startDate?: string;
    endDate?: string;
  },
): Promise<Result<SelectMatterExpense[]>> => {
  // Verify user has access to matter
  const matterResult = await mattersService.getMatterById(organizationId, matterId, user, requestHeaders);
  if (!matterResult.success) {
    return matterResult;
  }

  try {
    const expenses = await matterExpensesQueries.listMatterExpenses(matterId, filters);
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
  organizationId: string,
  matterId: string,
  expenseId: string,
  data: UpdateMatterExpenseRequest,
  user: User,
  requestHeaders: Record<string, string>,
): Promise<Result<SelectMatterExpense>> => {
  // Verify user has access to matter
  const matterResult = await mattersService.getMatterById(organizationId, matterId, user, requestHeaders);
  if (!matterResult.success) {
    return matterResult;
  }

  try {
    // Verify expense exists and belongs to matter
    const expense = await matterExpensesQueries.findMatterExpenseById(expenseId);
    if (!expense || expense.matter_id !== matterId) {
      return notFound('Expense not found');
    }

    const updated = await matterExpensesQueries.updateMatterExpense(expenseId, data);

    // Log activity
    await matterActivityService.logMatterActivity(
      matterId,
      matterActivityService.ActivityAction.EXPENSE_UPDATED,
      `${user.name || user.email} updated an expense`,
      user.id,
    );

    return ok(updated!);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to update matter expense {expenseId}: {error}', {
      expenseId,
      error: message,
    });
    return internalError(message);
  }
};

/**
 * Delete matter expense
 */
const deleteMatterExpense = async (
  organizationId: string,
  matterId: string,
  expenseId: string,
  user: User,
  requestHeaders: Record<string, string>,
): Promise<Result<{ success: true }>> => {
  // Verify user has access to matter
  const matterResult = await mattersService.getMatterById(organizationId, matterId, user, requestHeaders);
  if (!matterResult.success) {
    return matterResult;
  }

  try {
    // Verify expense exists and belongs to matter
    const expense = await matterExpensesQueries.findMatterExpenseById(expenseId);
    if (!expense || expense.matter_id !== matterId) {
      return notFound('Expense not found');
    }

    await matterExpensesQueries.deleteMatterExpense(expenseId);

    // Log activity
    await matterActivityService.logMatterActivity(
      matterId,
      matterActivityService.ActivityAction.EXPENSE_DELETED,
      `${user.name || user.email} deleted an expense`,
      user.id,
    );

    return ok({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to delete matter expense {expenseId}: {error}', {
      expenseId,
      error: message,
    });
    return internalError(message);
  }
};

/**
 * Get expense statistics
 */
const getExpenseStats = async (
  organizationId: string,
  matterId: string,
  user: User,
  requestHeaders: Record<string, string>,
): Promise<Result<{
  totalBillableCents: number;
  totalCents: number;
  totalBillable: number;
  total: number;
}>> => {
  // Verify user has access to matter
  const matterResult = await mattersService.getMatterById(organizationId, matterId, user, requestHeaders);
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

