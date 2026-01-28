import { getLogger } from '@logtape/logtape';
import * as expensesQueries from '@/modules/matters/database/queries/matter-expenses.queries';
import type { SelectMatterExpense } from '@/modules/matters/database/schema/matter-expenses.schema';
import { logMatterActivity, ActivityAction } from '@/modules/matters/services/matter-activity.service';
import { getMatterById } from '@/modules/matters/services/matters.service';
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
export const createMatterExpense = async (
  organizationId: string,
  matterId: string,
  data: CreateMatterExpenseRequest,
  user: User,
  requestHeaders: Record<string, string>,
): Promise<Result<SelectMatterExpense>> => {
  // Verify user has access to matter
  const matterResult = await getMatterById(organizationId, matterId, user, requestHeaders);
  if (!matterResult.success) {
    return matterResult;
  }

  try {
    const expense = await expensesQueries.createMatterExpense({
      matter_id: matterId,
      user_id: user.id,
      description: data.description,
      amount: data.amount,
      date: data.date,
      billable: data.billable,
    });

    // Log activity
    const amountFormatted = (data.amount / 100).toFixed(2);
    await logMatterActivity(
      matterId,
      ActivityAction.EXPENSE_ADDED,
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
export const listMatterExpenses = async (
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
  const matterResult = await getMatterById(organizationId, matterId, user, requestHeaders);
  if (!matterResult.success) {
    return matterResult;
  }

  try {
    const expenses = await expensesQueries.listMatterExpenses(matterId, filters);
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
export const updateMatterExpense = async (
  organizationId: string,
  matterId: string,
  expenseId: string,
  data: UpdateMatterExpenseRequest,
  user: User,
  requestHeaders: Record<string, string>,
): Promise<Result<SelectMatterExpense>> => {
  // Verify user has access to matter
  const matterResult = await getMatterById(organizationId, matterId, user, requestHeaders);
  if (!matterResult.success) {
    return matterResult;
  }

  try {
    // Verify expense exists and belongs to matter
    const expense = await expensesQueries.findMatterExpenseById(expenseId);
    if (!expense || expense.matter_id !== matterId) {
      return notFound('Expense not found');
    }

    const updated = await expensesQueries.updateMatterExpense(expenseId, data);

    // Log activity
    await logMatterActivity(
      matterId,
      ActivityAction.EXPENSE_UPDATED,
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
export const deleteMatterExpense = async (
  organizationId: string,
  matterId: string,
  expenseId: string,
  user: User,
  requestHeaders: Record<string, string>,
): Promise<Result<{ success: true }>> => {
  // Verify user has access to matter
  const matterResult = await getMatterById(organizationId, matterId, user, requestHeaders);
  if (!matterResult.success) {
    return matterResult;
  }

  try {
    // Verify expense exists and belongs to matter
    const expense = await expensesQueries.findMatterExpenseById(expenseId);
    if (!expense || expense.matter_id !== matterId) {
      return notFound('Expense not found');
    }

    await expensesQueries.deleteMatterExpense(expenseId);

    // Log activity
    await logMatterActivity(
      matterId,
      ActivityAction.EXPENSE_DELETED,
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
export const getExpenseStats = async (
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
  const matterResult = await getMatterById(organizationId, matterId, user, requestHeaders);
  if (!matterResult.success) {
    return matterResult;
  }

  try {
    const totalBillable = await expensesQueries.getTotalBillableExpenses(matterId);
    const totalExpenses = await expensesQueries.getTotalExpenses(matterId);

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

