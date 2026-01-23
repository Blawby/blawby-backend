import { eq, and, desc } from 'drizzle-orm';
import { db } from '@/shared/database';
import {
  matterNotes,
  type InsertMatterNote,
  type SelectMatterNote,
} from '@/modules/matters/database/schema/matter-notes.schema';

// Create matter note
export const createMatterNote = async (
  data: InsertMatterNote,
): Promise<SelectMatterNote> => {
  const [note] = await db
    .insert(matterNotes)
    .values(data)
    .returning();
  return note;
};

// Find matter note by ID
export const findMatterNoteById = async (
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
export const listMatterNotes = async (
  matterId: string,
): Promise<SelectMatterNote[]> => {
  return await db
    .select()
    .from(matterNotes)
    .where(eq(matterNotes.matter_id, matterId))
    .orderBy(desc(matterNotes.created_at));
};

// Update matter note
export const updateMatterNote = async (
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
export const deleteMatterNote = async (id: string): Promise<void> => {
  await db.delete(matterNotes).where(eq(matterNotes.id, id));
};
