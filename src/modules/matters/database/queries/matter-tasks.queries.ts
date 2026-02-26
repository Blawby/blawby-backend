import { and, asc, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import {
  matterTasks,
  type InsertMatterTask,
  type SelectMatterTask,
} from '@/modules/matters/database/schema/matter-tasks.schema';
import type { MatterTaskListFilters } from '@/modules/matters/types/matter-filters.types';
import * as schema from '@/schema';
import { db } from '@/shared/database';

const createMatterTask = async (
  data: InsertMatterTask,
): Promise<SelectMatterTask> => {
  const [task] = await db
    .insert(matterTasks)
    .values(data)
    .returning();
  return task;
};

const createMatterTasks = async (
  data: InsertMatterTask[],
  tx?: NodePgDatabase<typeof schema>,
): Promise<SelectMatterTask[]> => {
  if (data.length === 0) return [];

  const client = tx ?? db;
  return await client
    .insert(matterTasks)
    .values(data)
    .returning();
};

const findMatterTaskById = async (
  id: string,
): Promise<SelectMatterTask | undefined> => {
  const [task] = await db
    .select()
    .from(matterTasks)
    .where(eq(matterTasks.id, id))
    .limit(1);
  return task;
};

const listMatterTasks = async (
  matterId: string,
  filters?: MatterTaskListFilters,
): Promise<SelectMatterTask[]> => {
  const conditions = [eq(matterTasks.matter_id, matterId)];

  if (filters?.taskId) {
    conditions.push(eq(matterTasks.id, filters.taskId));
  }
  if (filters?.status) {
    conditions.push(eq(matterTasks.status, filters.status));
  }
  if (filters?.priority) {
    conditions.push(eq(matterTasks.priority, filters.priority));
  }
  if (filters?.assigneeId) {
    conditions.push(eq(matterTasks.assignee_id, filters.assigneeId));
  }
  if (filters?.stage) {
    conditions.push(eq(matterTasks.stage, filters.stage));
  }

  return await db
    .select()
    .from(matterTasks)
    .where(and(...conditions))
    .orderBy(asc(matterTasks.due_date), asc(matterTasks.created_at));
};

const updateMatterTask = async (
  id: string,
  data: Partial<InsertMatterTask>,
): Promise<SelectMatterTask | undefined> => {
  const [task] = await db
    .update(matterTasks)
    .set({ ...data, updated_at: new Date() })
    .where(eq(matterTasks.id, id))
    .returning();
  return task;
};

const deleteMatterTask = async (id: string): Promise<void> => {
  await db.delete(matterTasks).where(eq(matterTasks.id, id));
};

export const matterTasksQueries = {
  createMatterTask,
  createMatterTasks,
  findMatterTaskById,
  listMatterTasks,
  updateMatterTask,
  deleteMatterTask,
};
