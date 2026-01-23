/**
 * Matter Notes Service
 *
 * Handles business logic for matter notes operations
 */

import * as notesQueries from '@/modules/matters/database/queries/matter-notes.queries';
import { getMatterById } from './matters.service';
import type { User } from '@/shared/types/BetterAuth';
import type {
  CreateMatterNoteRequest,
  UpdateMatterNoteRequest,
} from '@/modules/matters/types/matter.types';
import { logMatterActivity, ActivityAction } from './matter-activity.service';

/**
 * Create a matter note
 */
export const createMatterNote = async (
  organizationId: string,
  matterId: string,
  data: CreateMatterNoteRequest,
  user: User,
  requestHeaders: Record<string, string>,
) => {
  // Verify user has access to matter
  await getMatterById(organizationId, matterId, user, requestHeaders);

  const note = await notesQueries.createMatterNote({
    matter_id: matterId,
    user_id: user.id,
    content: data.content,
  });

  // Log activity
  await logMatterActivity(
    matterId,
    ActivityAction.NOTE_ADDED,
    `${user.name || user.email} added a note`,
    user.id,
  );

  return note;
};

/**
 * List matter notes
 */
export const listMatterNotes = async (
  organizationId: string,
  matterId: string,
  user: User,
  requestHeaders: Record<string, string>,
) => {
  // Verify user has access to matter
  await getMatterById(organizationId, matterId, user, requestHeaders);

  return await notesQueries.listMatterNotes(matterId);
};

/**
 * Update matter note
 */
export const updateMatterNote = async (
  organizationId: string,
  matterId: string,
  noteId: string,
  data: UpdateMatterNoteRequest,
  user: User,
  requestHeaders: Record<string, string>,
) => {
  // Verify user has access to matter
  await getMatterById(organizationId, matterId, user, requestHeaders);

  // Verify note exists and belongs to matter
  const note = await notesQueries.findMatterNoteById(noteId);
  if (!note || note.matter_id !== matterId) {
    throw new Error('Note not found');
  }

  const updated = await notesQueries.updateMatterNote(noteId, data);

  // Log activity
  await logMatterActivity(
    matterId,
    ActivityAction.NOTE_UPDATED,
    `${user.name || user.email} updated a note`,
    user.id,
  );

  return updated;
};

/**
 * Delete matter note
 */
export const deleteMatterNote = async (
  organizationId: string,
  matterId: string,
  noteId: string,
  user: User,
  requestHeaders: Record<string, string>,
) => {
  // Verify user has access to matter
  await getMatterById(organizationId, matterId, user, requestHeaders);

  // Verify note exists and belongs to matter
  const note = await notesQueries.findMatterNoteById(noteId);
  if (!note || note.matter_id !== matterId) {
    throw new Error('Note not found');
  }

  await notesQueries.deleteMatterNote(noteId);

  // Log activity
  await logMatterActivity(
    matterId,
    ActivityAction.NOTE_DELETED,
    `${user.name || user.email} deleted a note`,
    user.id,
  );
};
