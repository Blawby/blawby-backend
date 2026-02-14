import {
  eq, and, desc, gte, lte, sql,
} from 'drizzle-orm';
import {
  matterTimeEntries,
  type InsertMatterTimeEntry,
  type SelectMatterTimeEntry,
} from '@/modules/matters/database/schema/matter-time-entries.schema';
import type { MatterTimeEntryListFilters } from '@/modules/matters/types/matter-filters.types';
import { db } from '@/shared/database';

// Create matter time entry
const createMatterTimeEntry = async (
  data: InsertMatterTimeEntry,
): Promise<SelectMatterTimeEntry> => {
  const [entry] = await db
    .insert(matterTimeEntries)
    .values(data)
    .returning();
  return entry;
};

// Find matter time entry by ID
const findMatterTimeEntryById = async (
  id: string,
): Promise<SelectMatterTimeEntry | undefined> => {
  const [entry] = await db
    .select()
    .from(matterTimeEntries)
    .where(eq(matterTimeEntries.id, id))
    .limit(1);
  return entry;
};

// List matter time entries
const listMatterTimeEntries = async (
  matterId: string,
  filters?: MatterTimeEntryListFilters,
): Promise<SelectMatterTimeEntry[]> => {
  const conditions = [eq(matterTimeEntries.matter_id, matterId)];

  if (filters?.entryId) {
    conditions.push(eq(matterTimeEntries.id, filters.entryId));
  }

  if (filters?.billable !== undefined) {
    conditions.push(eq(matterTimeEntries.billable, filters.billable));
  }

  if (filters?.startDate) {
    conditions.push(gte(matterTimeEntries.start_time, filters.startDate));
  }

  if (filters?.endDate) {
    conditions.push(lte(matterTimeEntries.end_time, filters.endDate));
  }

  return await db
    .select()
    .from(matterTimeEntries)
    .where(and(...conditions))
    .orderBy(desc(matterTimeEntries.start_time));
};

// Update matter time entry
const updateMatterTimeEntry = async (
  id: string,
  data: Partial<InsertMatterTimeEntry>,
): Promise<SelectMatterTimeEntry | undefined> => {
  const [entry] = await db
    .update(matterTimeEntries)
    .set({ ...data, updated_at: new Date() })
    .where(eq(matterTimeEntries.id, id))
    .returning();
  return entry;
};

// Delete matter time entry
const deleteMatterTimeEntry = async (id: string): Promise<void> => {
  await db.delete(matterTimeEntries).where(eq(matterTimeEntries.id, id));
};

// Get total billable time for matter
const getTotalBillableTime = async (
  matterId: string,
): Promise<number> => {
  const [result] = await db
    .select({
      total: sql<number>`COALESCE(SUM(${matterTimeEntries.duration}), 0)`,
    })
    .from(matterTimeEntries)
    .where(
      and(
        eq(matterTimeEntries.matter_id, matterId),
        eq(matterTimeEntries.billable, true),
      ),
    );

  return Number(result.total);
};

// Get total time for matter (billable and non-billable)
const getTotalTime = async (
  matterId: string,
): Promise<number> => {
  const [result] = await db
    .select({
      total: sql<number>`COALESCE(SUM(${matterTimeEntries.duration}), 0)`,
    })
    .from(matterTimeEntries)
    .where(eq(matterTimeEntries.matter_id, matterId));

  return Number(result.total);
};

export const matterTimeEntriesQueries = {
  createMatterTimeEntry,
  findMatterTimeEntryById,
  listMatterTimeEntries,
  updateMatterTimeEntry,
  deleteMatterTimeEntry,
  getTotalBillableTime,
  getTotalTime,
};
