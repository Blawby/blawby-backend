import { eq, desc, and } from 'drizzle-orm';
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
  updateMatterNote,
  deleteMatterNote,
};
