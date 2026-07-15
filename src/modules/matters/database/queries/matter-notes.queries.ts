import { eq, desc, and, count } from 'drizzle-orm';
import {
  matterNotes,
  type InsertMatterNote,
  type SelectMatterNote,
} from '@/modules/matters/database/schema/matter-notes.schema';
import type { MatterNoteListFilters } from '@/modules/matters/types/matter-filters.types';
import { getActiveTx } from '@/shared/database/uow';

// Create matter note
const createMatterNote = async (data: InsertMatterNote): Promise<SelectMatterNote> => {
  const [note] = await getActiveTx().insert(matterNotes).values(data).returning();
  return note;
};

// Find matter note by ID
const findMatterNoteById = async (id: string): Promise<SelectMatterNote | undefined> => {
  const [note] = await getActiveTx().select().from(matterNotes).where(eq(matterNotes.id, id)).limit(1);
  return note;
};

// List matter notes
const listMatterNotes = async (matterId: string, filters?: MatterNoteListFilters): Promise<SelectMatterNote[]> => {
  const conditions = [eq(matterNotes.matter_id, matterId)];
  if (filters?.noteId) {
    conditions.push(eq(matterNotes.id, filters.noteId));
  }

  return await getActiveTx()
    .select()
    .from(matterNotes)
    .where(and(...conditions))
    .orderBy(desc(matterNotes.created_at));
};

// Page-based listing with total count (single entry when noteId is set)
const listMatterNotesPaginated = async (
  matterId: string,
  filters?: MatterNoteListFilters & { page?: number; limit?: number }
): Promise<{ data: SelectMatterNote[]; total: number; page: number; limit: number }> => {
  const page = filters?.page ?? 1;
  const limit = filters?.limit ?? 20;
  const offset = (page - 1) * limit;

  if (filters?.noteId) {
    const data = await listMatterNotes(matterId, { noteId: filters.noteId });
    return { data, total: data.length, page, limit };
  }

  const whereClause = eq(matterNotes.matter_id, matterId);

  const [data, [countRow]] = await Promise.all([
    getActiveTx()
      .select()
      .from(matterNotes)
      .where(whereClause)
      .orderBy(desc(matterNotes.created_at))
      .limit(limit)
      .offset(offset),
    getActiveTx().select({ total: count() }).from(matterNotes).where(whereClause),
  ]);

  return { data, total: countRow?.total ?? 0, page, limit };
};

// Update matter note
const updateMatterNote = async (id: string, data: Partial<InsertMatterNote>): Promise<SelectMatterNote | undefined> => {
  const [note] = await getActiveTx()
    .update(matterNotes)
    .set({ ...data, updated_at: new Date() })
    .where(eq(matterNotes.id, id))
    .returning();
  return note;
};

// Delete matter note
const deleteMatterNote = async (id: string): Promise<void> => {
  await getActiveTx().delete(matterNotes).where(eq(matterNotes.id, id));
};

export const matterNotesQueries = {
  createMatterNote,
  findMatterNoteById,
  listMatterNotes,
  listMatterNotesPaginated,
  updateMatterNote,
  deleteMatterNote,
};
