import { and, asc, count, desc, eq, getTableColumns, isNull, lt } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import {
  matterTasks,
  type InsertMatterTask,
  type SelectMatterTask,
} from '@/modules/matters/database/schema/matter-tasks.schema';
import { matters } from '@/modules/matters/database/schema/matters.schema';
import type { MatterTaskListFilters, OrgTaskListFilters } from '@/modules/matters/types/matter-filters.types';
import type * as schema from '@/schema';
import { db } from '@/shared/database';

const createMatterTasks = async (
  data: InsertMatterTask | InsertMatterTask[],
  tx?: NodePgDatabase<typeof schema>
): Promise<SelectMatterTask[]> => {
  const items = Array.isArray(data) ? data : [data];
  if (items.length === 0) {
    return [];
  }

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
  if (filters?.taskId) {
    conditions.push(eq(matterTasks.id, filters.taskId));
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

const deleteMatterTask = async (id: string): Promise<boolean> => {
  const rows = await db.delete(matterTasks).where(eq(matterTasks.id, id)).returning({ id: matterTasks.id });
  return rows.length > 0;
};

/**
 * List tasks across an organization, joined to matters for org scoping
 * and to exclude soft-deleted matters.
 *
 * due_before semantics: `due_date < due_before` — excludes tasks with NULL due_date.
 */
const listTasksByOrganization = async (
  organizationId: string,
  filters?: OrgTaskListFilters
): Promise<{ data: SelectMatterTask[]; total: number; page: number; limit: number }> => {
  const page = filters?.page ?? 1;
  const limit = filters?.limit ?? 20;
  const offset = (page - 1) * limit;

  const conditions = [eq(matters.organization_id, organizationId), isNull(matters.deleted_at)];

  if (filters?.assigneeId) {
    conditions.push(eq(matterTasks.assignee_id, filters.assigneeId));
  }
  if (filters?.status) {
    conditions.push(eq(matterTasks.status, filters.status));
  }
  if (filters?.dueBefore) {
    conditions.push(lt(matterTasks.due_date, filters.dueBefore));
  }

  const whereClause = and(...conditions);

  const [tasks, [countRow]] = await Promise.all([
    db
      .select(getTableColumns(matterTasks))
      .from(matterTasks)
      .innerJoin(matters, eq(matterTasks.matter_id, matters.id))
      .where(whereClause)
      .orderBy(desc(matterTasks.created_at))
      .limit(limit)
      .offset(offset),
    db
      .select({ total: count() })
      .from(matterTasks)
      .innerJoin(matters, eq(matterTasks.matter_id, matters.id))
      .where(whereClause),
  ]);

  return { data: tasks, total: Number(countRow?.total ?? 0), page, limit };
};

export const matterTasksQueries = {
  createMatterTasks,
  findMatterTaskById,
  listMatterTasks,
  listTasksByOrganization,
  updateMatterTask,
  deleteMatterTask,
};
