import { eq, and, desc, gte, lte, sql, inArray, isNull } from 'drizzle-orm';
import {
  matterExpenses,
  type InsertMatterExpense,
  type SelectMatterExpense,
} from '@/modules/matters/database/schema/matter-expenses.schema';
import type { MatterExpenseListFilters } from '@/modules/matters/types/matter-filters.types';
import { db } from '@/shared/database';

// Create matter expense
const createMatterExpense = async (data: InsertMatterExpense): Promise<SelectMatterExpense> => {
  const [expense] = await db.insert(matterExpenses).values(data).returning();
  return expense;
};

// Find matter expense by ID
const findMatterExpenseById = async (id: string): Promise<SelectMatterExpense | undefined> => {
  const [expense] = await db.select().from(matterExpenses).where(eq(matterExpenses.id, id)).limit(1);
  return expense;
};

const formatLocalDate = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// List matter expenses
const listMatterExpenses = async (
  matterId: string,
  filters?: MatterExpenseListFilters
): Promise<SelectMatterExpense[]> => {
  const conditions = [eq(matterExpenses.matter_id, matterId)];

  if (filters?.expenseId) {
    conditions.push(eq(matterExpenses.id, filters.expenseId));
  }

  if (filters?.billable !== undefined) {
    conditions.push(eq(matterExpenses.billable, filters.billable));
  }

  if (filters?.startDate) {
    conditions.push(gte(matterExpenses.date, formatLocalDate(filters.startDate)));
  }

  if (filters?.endDate) {
    conditions.push(lte(matterExpenses.date, formatLocalDate(filters.endDate)));
  }

  return await db
    .select()
    .from(matterExpenses)
    .where(and(...conditions))
    .orderBy(desc(matterExpenses.date));
};

// Update matter expense
const updateMatterExpense = async (
  id: string,
  matterId: string,
  data: Partial<InsertMatterExpense>
): Promise<SelectMatterExpense | undefined> => {
  const [expense] = await db
    .update(matterExpenses)
    .set({ ...data, updated_at: new Date() })
    .where(and(eq(matterExpenses.id, id), eq(matterExpenses.matter_id, matterId)))
    .returning();
  return expense;
};

// Delete matter expense
const deleteMatterExpense = async (id: string, matterId: string): Promise<boolean> => {
  const deleted = await db
    .delete(matterExpenses)
    .where(and(eq(matterExpenses.id, id), eq(matterExpenses.matter_id, matterId)))
    .returning({ id: matterExpenses.id });
  return deleted.length > 0;
};

// Get total billable expenses for matter
const getTotalBillableExpenses = async (matterId: string): Promise<number> => {
  const [result] = await db
    .select({
      total: sql<number>`COALESCE(SUM(${matterExpenses.amount}), 0)`,
    })
    .from(matterExpenses)
    .where(and(eq(matterExpenses.matter_id, matterId), eq(matterExpenses.billable, true)));

  return Number(result.total);
};

// Get total expenses for matter (billable and non-billable)
const getTotalExpenses = async (matterId: string): Promise<number> => {
  const [result] = await db
    .select({
      total: sql<number>`COALESCE(SUM(${matterExpenses.amount}), 0)`,
    })
    .from(matterExpenses)
    .where(eq(matterExpenses.matter_id, matterId));

  return Number(result.total);
};

/**
 * Mark expenses as invoiced. Sets invoice_id and invoiced_at on all specified IDs.
 */
const markAsInvoiced = async (expenseIds: string[], invoiceId: string, tx?: typeof db): Promise<void> => {
  if (expenseIds.length === 0) return;
  const client = tx || db;
  await client
    .update(matterExpenses)
    .set({
      invoice_id: invoiceId,
      invoiced_at: new Date(),
      updated_at: new Date(),
    })
    .where(inArray(matterExpenses.id, expenseIds));
};

/**
 * Unmark expenses as invoiced. Resets invoice_id and invoiced_at for expenses linked to the given invoice.
 */
const unmarkInvoiced = async (invoiceId: string, tx?: typeof db): Promise<void> => {
  const client = tx || db;
  await client
    .update(matterExpenses)
    .set({
      invoice_id: null,
      invoiced_at: null,
      updated_at: new Date(),
    })
    .where(eq(matterExpenses.invoice_id, invoiceId));
};

/**
 * Get unbilled expenses for a matter: invoice_id IS NULL AND billable = true.
 */
const getUnbilled = async (matterId: string): Promise<SelectMatterExpense[]> => {
  return await db
    .select()
    .from(matterExpenses)
    .where(
      and(eq(matterExpenses.matter_id, matterId), isNull(matterExpenses.invoice_id), eq(matterExpenses.billable, true))
    )
    .orderBy(desc(matterExpenses.date));
};

export const matterExpensesQueries = {
  createMatterExpense,
  findMatterExpenseById,
  listMatterExpenses,
  updateMatterExpense,
  deleteMatterExpense,
  getTotalBillableExpenses,
  getTotalExpenses,
  markAsInvoiced,
  unmarkInvoiced,
  getUnbilled,
};
