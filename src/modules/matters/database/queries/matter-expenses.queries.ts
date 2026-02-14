import {
  eq, and, desc, gte, lte, sql,
} from 'drizzle-orm';
import {
  matterExpenses,
  type InsertMatterExpense,
  type SelectMatterExpense,
} from '@/modules/matters/database/schema/matter-expenses.schema';
import { db } from '@/shared/database';

// Create matter expense
const createMatterExpense = async (
  data: InsertMatterExpense,
): Promise<SelectMatterExpense> => {
  const [expense] = await db
    .insert(matterExpenses)
    .values(data)
    .returning();
  return expense;
};

// Find matter expense by ID
const findMatterExpenseById = async (
  id: string,
): Promise<SelectMatterExpense | undefined> => {
  const [expense] = await db
    .select()
    .from(matterExpenses)
    .where(eq(matterExpenses.id, id))
    .limit(1);
  return expense;
};

// List matter expenses
const listMatterExpenses = async (
  matterId: string,
  filters?: {
    billable?: boolean;
    startDate?: Date;
    endDate?: Date;
    expense_id?: string;
  },
): Promise<SelectMatterExpense[]> => {
  const conditions = [eq(matterExpenses.matter_id, matterId)];

  if (filters?.expense_id) {
    conditions.push(eq(matterExpenses.id, filters.expense_id));
  }

  if (filters?.billable !== undefined) {
    conditions.push(eq(matterExpenses.billable, filters.billable));
  }

  if (filters?.startDate) {
    conditions.push(gte(matterExpenses.date, filters.startDate.toISOString().split('T')[0]));
  }

  if (filters?.endDate) {
    conditions.push(lte(matterExpenses.date, filters.endDate.toISOString().split('T')[0]));
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
  data: Partial<InsertMatterExpense>,
): Promise<SelectMatterExpense | undefined> => {
  const [expense] = await db
    .update(matterExpenses)
    .set({ ...data, updated_at: new Date() })
    .where(eq(matterExpenses.id, id))
    .returning();
  return expense;
};

// Delete matter expense
const deleteMatterExpense = async (id: string): Promise<void> => {
  await db.delete(matterExpenses).where(eq(matterExpenses.id, id));
};

// Get total billable expenses for matter
const getTotalBillableExpenses = async (
  matterId: string,
): Promise<number> => {
  const [result] = await db
    .select({
      total: sql<number>`COALESCE(SUM(${matterExpenses.amount}), 0)`,
    })
    .from(matterExpenses)
    .where(
      and(
        eq(matterExpenses.matter_id, matterId),
        eq(matterExpenses.billable, true),
      ),
    );

  return Number(result.total);
};

// Get total expenses for matter (billable and non-billable)
const getTotalExpenses = async (
  matterId: string,
): Promise<number> => {
  const [result] = await db
    .select({
      total: sql<number>`COALESCE(SUM(${matterExpenses.amount}), 0)`,
    })
    .from(matterExpenses)
    .where(eq(matterExpenses.matter_id, matterId));

  return Number(result.total);
};

export const matterExpensesQueries = {
  createMatterExpense,
  findMatterExpenseById,
  listMatterExpenses,
  updateMatterExpense,
  deleteMatterExpense,
  getTotalBillableExpenses,
  getTotalExpenses,
};
