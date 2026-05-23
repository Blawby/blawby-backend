import { eq, and, desc, gte, lte, sql, inArray, isNull, isNotNull } from 'drizzle-orm';
import {
  matterTimeEntries,
  type InsertMatterTimeEntry,
  type SelectMatterTimeEntry,
} from '@/modules/matters/database/schema/matter-time-entries.schema';
import type { MatterTimeEntryListFilters } from '@/modules/matters/types/matter-filters.types';
import { db } from '@/shared/database';

// Create matter time entry
const createMatterTimeEntry = async (data: InsertMatterTimeEntry): Promise<SelectMatterTimeEntry> => {
  const [entry] = await db.insert(matterTimeEntries).values(data).returning();
  return entry;
};

// Find matter time entry by ID
const findMatterTimeEntryById = async (id: string): Promise<SelectMatterTimeEntry | undefined> => {
  const [entry] = await db.select().from(matterTimeEntries).where(eq(matterTimeEntries.id, id)).limit(1);
  return entry;
};

// List matter time entries
const listMatterTimeEntries = async (
  matterId: string,
  filters?: MatterTimeEntryListFilters
): Promise<SelectMatterTimeEntry[]> => {
  const conditions = [eq(matterTimeEntries.matter_id, matterId)];

  if (filters?.entryId) {
    conditions.push(eq(matterTimeEntries.id, filters.entryId));
  }

  if (filters?.billable !== undefined) {
    conditions.push(eq(matterTimeEntries.billable, filters.billable));
  }

  if (filters?.invoiced !== undefined) {
    conditions.push(filters.invoiced ? isNotNull(matterTimeEntries.invoice_id) : isNull(matterTimeEntries.invoice_id));
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
  data: Partial<InsertMatterTimeEntry>
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
const getTotalBillableTime = async (matterId: string): Promise<number> => {
  const [result] = await db
    .select({
      total: sql<number>`COALESCE(SUM(${matterTimeEntries.duration}), 0)`,
    })
    .from(matterTimeEntries)
    .where(and(eq(matterTimeEntries.matter_id, matterId), eq(matterTimeEntries.billable, true)));

  return Number(result.total);
};

// Get total time for matter (billable and non-billable)
const getTotalTime = async (matterId: string): Promise<number> => {
  const [result] = await db
    .select({
      total: sql<number>`COALESCE(SUM(${matterTimeEntries.duration}), 0)`,
    })
    .from(matterTimeEntries)
    .where(eq(matterTimeEntries.matter_id, matterId));

  return Number(result.total);
};

/**
 * Mark time entries as invoiced. Sets invoice_id and invoiced_at on all specified IDs.
 */
const markAsInvoiced = async (
  timeEntryIds: string[],
  invoiceId: string,
  matterId: string,
  tx?: typeof db
): Promise<void> => {
  if (timeEntryIds.length === 0) {
    return;
  }
  const client = tx ?? db;
  await client
    .update(matterTimeEntries)
    .set({
      invoice_id: invoiceId,
      invoiced_at: new Date(),
      updated_at: new Date(),
    })
    .where(and(inArray(matterTimeEntries.id, timeEntryIds), eq(matterTimeEntries.matter_id, matterId)));
};

/**
 * Unmark time entries as invoiced. Resets invoice_id and invoiced_at for entries linked to the given invoice.
 */
const unmarkInvoiced = async (invoiceId: string, tx?: typeof db): Promise<void> => {
  const client = tx ?? db;
  await client
    .update(matterTimeEntries)
    .set({
      invoice_id: null,
      invoiced_at: null,
      updated_at: new Date(),
    })
    .where(eq(matterTimeEntries.invoice_id, invoiceId));
};

/**
 * Get unbilled time entries for a matter: invoice_id IS NULL AND billable = true.
 */
const getUnbilled = async (matterId: string): Promise<SelectMatterTimeEntry[]> =>
  await db
    .select()
    .from(matterTimeEntries)
    .where(
      and(
        eq(matterTimeEntries.matter_id, matterId),
        isNull(matterTimeEntries.invoice_id),
        eq(matterTimeEntries.billable, true)
      )
    )
    .orderBy(desc(matterTimeEntries.start_time));

const countByIds = async (matterId: string, timeEntryIds: string[]): Promise<number> => {
  if (timeEntryIds.length === 0) {
    return 0;
  }

  const [result] = await db
    .select({ count: sql<number>`count(*)` })
    .from(matterTimeEntries)
    .where(and(eq(matterTimeEntries.matter_id, matterId), inArray(matterTimeEntries.id, timeEntryIds)));

  return Number(result?.count ?? 0);
};

export const matterTimeEntriesQueries = {
  createMatterTimeEntry,
  findMatterTimeEntryById,
  listMatterTimeEntries,
  updateMatterTimeEntry,
  deleteMatterTimeEntry,
  getTotalBillableTime,
  getTotalTime,
  markAsInvoiced,
  unmarkInvoiced,
  getUnbilled,
  countByIds,
};
