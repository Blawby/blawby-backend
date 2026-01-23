import { eq, and, asc, sql } from 'drizzle-orm';
import { db } from '@/shared/database';
import {
  matterMilestones,
  type InsertMatterMilestone,
  type SelectMatterMilestone,
} from '@/modules/matters/database/schema/matter-milestones.schema';

// Create matter milestone
export const createMatterMilestone = async (
  data: InsertMatterMilestone,
): Promise<SelectMatterMilestone> => {
  const [milestone] = await db
    .insert(matterMilestones)
    .values(data)
    .returning();
  return milestone;
};

// Create multiple milestones
export const createMatterMilestones = async (
  data: InsertMatterMilestone[],
): Promise<SelectMatterMilestone[]> => {
  if (data.length === 0) return [];

  return await db
    .insert(matterMilestones)
    .values(data)
    .returning();
};

// Find matter milestone by ID
export const findMatterMilestoneById = async (
  id: string,
): Promise<SelectMatterMilestone | undefined> => {
  const [milestone] = await db
    .select()
    .from(matterMilestones)
    .where(eq(matterMilestones.id, id))
    .limit(1);
  return milestone;
};

// List matter milestones
export const listMatterMilestones = async (
  matterId: string,
): Promise<SelectMatterMilestone[]> => {
  return await db
    .select()
    .from(matterMilestones)
    .where(eq(matterMilestones.matter_id, matterId))
    .orderBy(asc(matterMilestones.order), asc(matterMilestones.due_date));
};

// Update matter milestone
export const updateMatterMilestone = async (
  id: string,
  data: Partial<InsertMatterMilestone>,
): Promise<SelectMatterMilestone | undefined> => {
  const [milestone] = await db
    .update(matterMilestones)
    .set({ ...data, updated_at: new Date() })
    .where(eq(matterMilestones.id, id))
    .returning();
  return milestone;
};

// Delete matter milestone
export const deleteMatterMilestone = async (id: string): Promise<void> => {
  await db.delete(matterMilestones).where(eq(matterMilestones.id, id));
};

// Reorder milestones
export const reorderMilestones = async (
  updates: { id: string; order: number }[],
): Promise<void> => {
  if (updates.length === 0) return;

  await db.transaction(async (tx) => {
    for (const update of updates) {
      await tx
        .update(matterMilestones)
        .set({ order: update.order, updated_at: new Date() })
        .where(eq(matterMilestones.id, update.id));
    }
  });
};

// Get milestone statistics
export const getMilestoneStats = async (
  matterId: string,
): Promise<{
  total: number;
  pending: number;
  inProgress: number;
  completed: number;
  overdue: number;
  totalAmount: number;
  completedAmount: number;
}> => {
  const [stats] = await db
    .select({
      total: sql<number>`COUNT(*)`,
      pending: sql<number>`COUNT(CASE WHEN ${matterMilestones.status} = 'pending' THEN 1 END)`,
      inProgress: sql<number>`COUNT(CASE WHEN ${matterMilestones.status} = 'in_progress' THEN 1 END)`,
      completed: sql<number>`COUNT(CASE WHEN ${matterMilestones.status} = 'completed' THEN 1 END)`,
      overdue: sql<number>`COUNT(CASE WHEN ${matterMilestones.status} = 'overdue' THEN 1 END)`,
      totalAmount: sql<number>`COALESCE(SUM(${matterMilestones.amount}), 0)`,
      completedAmount: sql<number>`COALESCE(SUM(CASE WHEN ${matterMilestones.status} = 'completed' THEN ${matterMilestones.amount} ELSE 0 END), 0)`,
    })
    .from(matterMilestones)
    .where(eq(matterMilestones.matter_id, matterId));

  return {
    total: Number(stats.total),
    pending: Number(stats.pending),
    inProgress: Number(stats.inProgress),
    completed: Number(stats.completed),
    overdue: Number(stats.overdue),
    totalAmount: Number(stats.totalAmount),
    completedAmount: Number(stats.completedAmount),
  };
};
