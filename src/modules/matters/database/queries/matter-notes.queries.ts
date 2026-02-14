import { eq, desc, and } from 'drizzle-orm';
import {
  matterNotes,
  type InsertMatterNote,
  type SelectMatterNote,
} from '@/modules/matters/database/schema/matter-notes.schema';
import { db } from '@/shared/database';

// Create matter note
const createMatterNote = async (
  data: InsertMatterNote,
): Promise<SelectMatterNote> => {
  const [note] = await db
    .insert(matterNotes)
    .values(data)
    .returning();
  return note;
};

// Find matter note by ID
const findMatterNoteById = async (
  id: string,
): Promise<SelectMatterNote | undefined> => {
  const [note] = await db
    .select()
    .from(matterNotes)
    .where(eq(matterNotes.id, id))
    .limit(1);
  return note;
};

// List matter notes
const listMatterNotes = async (
  matterId: string,
  noteId?: string,
): Promise<SelectMatterNote[]> => {
  const conditions = [eq(matterNotes.matter_id, matterId)];
  if (noteId) {
    conditions.push(eq(matterNotes.id, noteId));
  }

  return await db
    .select()
    .from(matterNotes)
    .where(and(...conditions))
    .orderBy(desc(matterNotes.created_at));
};

// Update matter note
const updateMatterNote = async (
  id: string,
  data: Partial<InsertMatterNote>,
): Promise<SelectMatterNote | undefined> => {
  const [note] = await db
    .update(matterNotes)
    .set({ ...data, updated_at: new Date() })
    .where(eq(matterNotes.id, id))
    .returning();
  return note;
};

// Delete matter note
const deleteMatterNote = async (id: string): Promise<void> => {
  await db.delete(matterNotes).where(eq(matterNotes.id, id));
};

export const matterNotesQueries = {
  createMatterNote,
  findMatterNoteById,
  listMatterNotes,
  updateMatterNote,
  deleteMatterNote,
};
