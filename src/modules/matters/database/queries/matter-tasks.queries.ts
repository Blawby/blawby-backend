import { and, asc, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import {
  matterTasks,
  type InsertMatterTask,
  type SelectMatterTask,
} from '@/modules/matters/database/schema/matter-tasks.schema';
import type { MatterTaskListFilters } from '@/modules/matters/types/matter-filters.types';
import type * as schema from '@/schema';
import { db } from '@/shared/database';

const createMatterTasks = async (
  data: InsertMatterTask | InsertMatterTask[],
  tx?: NodePgDatabase<typeof schema>
): Promise<SelectMatterTask[]> => {
  const items = Array.isArray(data) ? data : [data];
  if (items.length === 0) {return [];}

  const client = tx ?? db;
  return await client.insert(matterTasks).values(items).returning();
};

const findMatterTaskById = async (id: string): Promise<SelectMatterTask | undefined> => {
  const [task] = await db.select().from(matterTasks).where(eq(matterTasks.id, id)).limit(1);
  return task;
};

const listMatterTasks = async (matterId: string, filters?: MatterTaskListFilters): Promise<SelectMatterTask[]> => {
  const conditions = [eq(matterTasks.matter_id, matterId)];

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

const updateMatterTask = async (id: string, data: Partial<InsertMatterTask>): Promise<SelectMatterTask | undefined> => {
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
  createMatterTasks,
  findMatterTaskById,
  listMatterTasks,
  updateMatterTask,
  deleteMatterTask,
};
