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
import type { Result } from '@/shared/types/result';
import type { ServiceContext } from '@/shared/types/service-context';
import { ok, internalError, notFound } from '@/shared/utils/result';

const logger = getLogger(['matters', 'services', 'notes']);

/**
 * Create a matter note
 */
const createMatterNote = async (
  matterId: string,
  data: CreateMatterNoteRequest,
  ctx: ServiceContext,
): Promise<Result<SelectMatterNote>> => {
  // Verify user has access to matter
  const matterResult = await mattersService.getMatterById(matterId, ctx);
  if (!matterResult.success) {
    return matterResult;
  }

  const note = await matterNotesQueries.createMatterNote({
    matter_id: matterId,
    user_id: ctx.userId,
    content: data.content,
  });

  // Log activity
  const userName = ctx.user?.name || ctx.user?.email || 'Unknown User';
  await matterActivityService.logMatterActivity(
    matterId,
    matterActivityService.ActivityAction.NOTE_ADDED,
    `${userName} added a note`,
    ctx.userId,
    { changed_fields: ['content'] },
  );

  return ok(note);
};

/**
 * List matter notes
 */
const listMatterNotes = async (
  matterId: string,
  filters: MatterNoteListFilters | undefined,
  ctx: ServiceContext,
): Promise<Result<SelectMatterNote[]>> => {
  // Verify user has access to matter
  const matterResult = await mattersService.getMatterById(matterId, ctx);
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
  matterId: string,
  noteId: string,
  data: UpdateMatterNoteRequest,
  ctx: ServiceContext,
): Promise<Result<SelectMatterNote>> => {
  // Verify user has access to matter
  const matterResult = await mattersService.getMatterById(matterId, ctx);
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
    const userName = ctx.user?.name || ctx.user?.email || 'Unknown User';
    await matterActivityService.logMatterActivity(
      matterId,
      matterActivityService.ActivityAction.NOTE_UPDATED,
      `${userName} updated a note`,
      ctx.userId,
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
  matterId: string,
  noteId: string,
  ctx: ServiceContext,
): Promise<Result<{ success: true }>> => {
  // Verify user has access to matter
  const matterResult = await mattersService.getMatterById(matterId, ctx);
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
    const userName = ctx.user?.name || ctx.user?.email || 'Unknown User';
    await matterActivityService.logMatterActivity(
      matterId,
      matterActivityService.ActivityAction.NOTE_DELETED,
      `${userName} deleted a note`,
      ctx.userId,
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
