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
export const createMatterExpense = async (
  data: InsertMatterExpense,
): Promise<SelectMatterExpense> => {
  const [expense] = await db
    .insert(matterExpenses)
    .values(data)
    .returning();
  return expense;
};

// Find matter expense by ID
export const findMatterExpenseById = async (
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
export const listMatterExpenses = async (
  matterId: string,
  filters?: {
    billable?: boolean;
    startDate?: string;
    endDate?: string;
  },
): Promise<SelectMatterExpense[]> => {
  const conditions = [eq(matterExpenses.matter_id, matterId)];

  if (filters?.billable !== undefined) {
    conditions.push(eq(matterExpenses.billable, filters.billable));
  }

  if (filters?.startDate) {
    conditions.push(gte(matterExpenses.date, filters.startDate));
  }

  if (filters?.endDate) {
    conditions.push(lte(matterExpenses.date, filters.endDate));
  }

  return await db
    .select()
    .from(matterExpenses)
    .where(and(...conditions))
    .orderBy(desc(matterExpenses.date));
};

// Update matter expense
export const updateMatterExpense = async (
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
export const deleteMatterExpense = async (id: string): Promise<void> => {
  await db.delete(matterExpenses).where(eq(matterExpenses.id, id));
};

// Get total billable expenses for matter
export const getTotalBillableExpenses = async (
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
export const getTotalExpenses = async (
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
