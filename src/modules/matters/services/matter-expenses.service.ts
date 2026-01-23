/**
 * Matter Expenses Service
 *
 * Handles business logic for matter expenses operations
 */

import * as expensesQueries from '@/modules/matters/database/queries/matter-expenses.queries';
import { getMatterById } from './matters.service';
import type { User } from '@/shared/types/BetterAuth';
import type {
  CreateMatterExpenseRequest,
  UpdateMatterExpenseRequest,
} from '@/modules/matters/types/matter.types';
import { logMatterActivity, ActivityAction } from './matter-activity.service';

/**
 * Create a matter expense
 */
export const createMatterExpense = async (
  organizationId: string,
  matterId: string,
  data: CreateMatterExpenseRequest,
  user: User,
  requestHeaders: Record<string, string>,
) => {
  // Verify user has access to matter
  await getMatterById(organizationId, matterId, user, requestHeaders);

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

  return expense;
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
) => {
  // Verify user has access to matter
  await getMatterById(organizationId, matterId, user, requestHeaders);

  return await expensesQueries.listMatterExpenses(matterId, filters);
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
) => {
  // Verify user has access to matter
  await getMatterById(organizationId, matterId, user, requestHeaders);

  // Verify expense exists and belongs to matter
  const expense = await expensesQueries.findMatterExpenseById(expenseId);
  if (!expense || expense.matter_id !== matterId) {
    throw new Error('Expense not found');
  }

  // Convert date if provided
  const updateData = {
    ...data,
    date: data.date,
  };

  const updated = await expensesQueries.updateMatterExpense(expenseId, updateData);

  // Log activity
  await logMatterActivity(
    matterId,
    ActivityAction.EXPENSE_UPDATED,
    `${user.name || user.email} updated an expense`,
    user.id,
  );

  return updated;
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
) => {
  // Verify user has access to matter
  await getMatterById(organizationId, matterId, user, requestHeaders);

  // Verify expense exists and belongs to matter
  const expense = await expensesQueries.findMatterExpenseById(expenseId);
  if (!expense || expense.matter_id !== matterId) {
    throw new Error('Expense not found');
  }

  await expensesQueries.deleteMatterExpense(expenseId);

  // Log activity
  await logMatterActivity(
    matterId,
    ActivityAction.EXPENSE_DELETED,
    `${user.name || user.email} deleted an expense`,
    user.id,
  );
};

/**
 * Get expense statistics
 */
export const getExpenseStats = async (
  organizationId: string,
  matterId: string,
  user: User,
  requestHeaders: Record<string, string>,
) => {
  // Verify user has access to matter
  await getMatterById(organizationId, matterId, user, requestHeaders);

  const totalBillable = await expensesQueries.getTotalBillableExpenses(matterId);
  const totalExpenses = await expensesQueries.getTotalExpenses(matterId);

  return {
    totalBillableCents: totalBillable,
    totalCents: totalExpenses,
    totalBillable: totalBillable / 100,
    total: totalExpenses / 100,
  };
};
