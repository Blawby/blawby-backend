import { getLogger } from '@logtape/logtape';
import { matterNotesQueries } from '@/modules/matters/database/queries/matter-notes.queries';
import type { SelectMatterNote } from '@/modules/matters/database/schema/matter-notes.schema';
import { matterActivityService } from '@/modules/matters/services/matter-activity.service';
import { mattersService } from '@/modules/matters/services/matters.service';
import type { MatterNoteListFilters } from '@/modules/matters/types/matter-filters.types';
import type {
  CreateMatterNoteRequest,
  UpdateMatterNoteRequest,
} from '@/modules/matters/types/matter.types';
import type { User } from '@/shared/types/BetterAuth';
import type { Result } from '@/shared/types/result';
import { ok, internalError, notFound } from '@/shared/utils/result';

const logger = getLogger(['matters', 'services', 'notes']);

/**
 * Create a matter note
 */
const createMatterNote = async (
  organizationId: string,
  matterId: string,
  data: CreateMatterNoteRequest,
  user: User,
  requestHeaders: Record<string, string>,
): Promise<Result<SelectMatterNote>> => {
  // Verify user has access to matter
  const matterResult = await mattersService.getMatterById(organizationId, matterId, user, requestHeaders);
  if (!matterResult.success) {
    return matterResult;
  }

  try {
    const note = await matterNotesQueries.createMatterNote({
      matter_id: matterId,
      user_id: user.id,
      content: data.content,
    });

    // Log activity
    await matterActivityService.logMatterActivity(
      matterId,
      matterActivityService.ActivityAction.NOTE_ADDED,
      `${user.name || user.email} added a note`,
      user.id,
      { changed_fields: ['content'] },
    );

    return ok(note);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to create matter note {matterId}: {error}', {
      matterId,
      error: message,
    });
    return internalError(message);
  }
};

/**
 * List matter notes
 */
const listMatterNotes = async (
  organizationId: string,
  matterId: string,
  user: User,
  requestHeaders: Record<string, string>,
  filters?: MatterNoteListFilters,
): Promise<Result<SelectMatterNote[]>> => {
  // Verify user has access to matter
  const matterResult = await mattersService.getMatterById(organizationId, matterId, user, requestHeaders);
  if (!matterResult.success) {
    return matterResult;
  }

  try {
    // Short-circuit: direct lookup when a specific note ID is provided
    if (filters?.noteId) {
      const note = await matterNotesQueries.findMatterNoteById(filters.noteId);
      if (!note || note.matter_id !== matterId) return ok([]);
      return ok([note]);
    }

    const notes = await matterNotesQueries.listMatterNotes(matterId, filters);
    return ok(notes);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to list matter notes {matterId}: {error}', {
      matterId,
      error: message,
    });
    return internalError(message);
  }
};

/**
 * Update matter note
 */
const updateMatterNote = async (
  organizationId: string,
  matterId: string,
  noteId: string,
  data: UpdateMatterNoteRequest,
  user: User,
  requestHeaders: Record<string, string>,
): Promise<Result<SelectMatterNote>> => {
  // Verify user has access to matter
  const matterResult = await mattersService.getMatterById(organizationId, matterId, user, requestHeaders);
  if (!matterResult.success) {
    return matterResult;
  }

  try {
    // Verify note exists and belongs to matter
    const note = await matterNotesQueries.findMatterNoteById(noteId);
    if (!note || note.matter_id !== matterId) {
      return notFound('Note not found');
    }

    const updated = await matterNotesQueries.updateMatterNote(noteId, data);
    const changedFields = [];
    if (data.content !== undefined && data.content !== note.content) {
      changedFields.push('content');
    }

    // Log activity
    await matterActivityService.logMatterActivity(
      matterId,
      matterActivityService.ActivityAction.NOTE_UPDATED,
      `${user.name || user.email} updated a note`,
      user.id,
      { changed_fields: changedFields },
    );

    return ok(updated!);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to update matter note {noteId}: {error}', {
      noteId,
      error: message,
    });
    return internalError(message);
  }
};

/**
 * Delete matter note
 */
const deleteMatterNote = async (
  organizationId: string,
  matterId: string,
  noteId: string,
  user: User,
  requestHeaders: Record<string, string>,
): Promise<Result<{ success: true }>> => {
  // Verify user has access to matter
  const matterResult = await mattersService.getMatterById(organizationId, matterId, user, requestHeaders);
  if (!matterResult.success) {
    return matterResult;
  }

  try {
    // Verify note exists and belongs to matter
    const note = await matterNotesQueries.findMatterNoteById(noteId);
    if (!note || note.matter_id !== matterId) {
      return notFound('Note not found');
    }

    await matterNotesQueries.deleteMatterNote(noteId);

    // Log activity
    await matterActivityService.logMatterActivity(
      matterId,
      matterActivityService.ActivityAction.NOTE_DELETED,
      `${user.name || user.email} deleted a note`,
      user.id,
      { changed_fields: ['deleted'] },
    );

    return ok({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to delete matter note {noteId}: {error}', {
      noteId,
      error: message,
    });
    return internalError(message);
  }
};

export const matterNotesService = {
  createMatterNote,
  listMatterNotes,
  updateMatterNote,
  deleteMatterNote,
};
