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
import { ok, internalError, notFound, forbidden } from '@/shared/utils/result';

const logger = getLogger(['matters', 'services', 'notes']);

const createMatterNote = async (
  params: { data: CreateMatterNoteRequest },
  ctx: ServiceContext,
): Promise<Result<SelectMatterNote>> => {
  const matterId = ctx.matterId;
  if (!matterId) {
    return internalError('Matter ID not found in context');
  }

  // CASL Check — generally only members/admins can modify matters
  if (ctx.ability.cannot('update', 'Matter')) {
    return forbidden('You do not have permission to update this matter');
  }

  // Verify user has access to matter
  const matterResult = await mattersService.getMatterById(matterId, ctx);
  if (!matterResult.success) {
    return matterResult as Result<never>;
  }

  try {
    const note = await matterNotesQueries.createMatterNote({
      matter_id: matterId,
      user_id: ctx.userId,
      content: params.data.content,
    });

    // Log activity
    const userName = ctx.user?.name || ctx.user?.email || 'Unknown User';
    const activityResult = await matterActivityService.logMatterActivity(
      {
        action: matterActivityService.ActivityAction.NOTE_ADDED,
        description: `${userName} added a note`,
        metadata: { changed_fields: ['content'] },
      },
      ctx,
    );
    if (!activityResult.success) {
      return activityResult as Result<SelectMatterNote>;
    }

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
  params: { filters?: MatterNoteListFilters },
  ctx: ServiceContext,
): Promise<Result<SelectMatterNote[]>> => {
  const matterId = ctx.matterId;
  if (!matterId) {
    return internalError('Matter ID not found in context');
  }

  // CASL Check
  if (ctx.ability.cannot('read', 'Matter')) {
    return forbidden('You do not have permission to read this matter');
  }

  // Verify user has access to matter
  const matterResult = await mattersService.getMatterById(matterId, ctx);
  if (!matterResult.success) {
    return matterResult as Result<never>;
  }

  try {
    // Short-circuit: direct lookup when a specific note ID is provided
    if (params.filters?.noteId) {
      const note = await matterNotesQueries.findMatterNoteById(params.filters.noteId);
      if (!note || note.matter_id !== matterId) return ok([]);
      return ok([note]);
    }

    const notes = await matterNotesQueries.listMatterNotes(matterId, params.filters);
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
  params: { noteId: string; data: UpdateMatterNoteRequest },
  ctx: ServiceContext,
): Promise<Result<SelectMatterNote>> => {
  const matterId = ctx.matterId;
  if (!matterId) {
    return internalError('Matter ID not found in context');
  }

  // CASL Check
  if (ctx.ability.cannot('update', 'Matter')) {
    return forbidden('You do not have permission to update this matter');
  }

  // Verify user has access to matter
  const matterResult = await mattersService.getMatterById(matterId, ctx);
  if (!matterResult.success) {
    return matterResult as Result<never>;
  }

  try {
    // Verify note exists and belongs to matter
    const note = await matterNotesQueries.findMatterNoteById(params.noteId);
    if (!note || note.matter_id !== matterId) {
      return notFound('Note not found');
    }

    const updated = await matterNotesQueries.updateMatterNote(params.noteId, params.data);
    const changedFields = [];
    if (params.data.content !== undefined && params.data.content !== note.content) {
      changedFields.push('content');
    }

    // Log activity
    const userName = ctx.user?.name || ctx.user?.email || 'Unknown User';
    const activityResult = await matterActivityService.logMatterActivity(
      {
        action: matterActivityService.ActivityAction.NOTE_UPDATED,
        description: `${userName} updated a note`,
        metadata: { changed_fields: changedFields },
      },
      ctx,
    );
    if (!activityResult.success) {
      return activityResult as Result<SelectMatterNote>;
    }

    return ok(updated!);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to update matter note {noteId}: {error}', {
      noteId: params.noteId,
      error: message,
    });
    return internalError(message);
  }
};

/**
 * Delete matter note
 */
const deleteMatterNote = async (
  params: { noteId: string },
  ctx: ServiceContext,
): Promise<Result<{ success: true }>> => {
  const matterId = ctx.matterId;
  if (!matterId) {
    return internalError('Matter ID not found in context');
  }

  // CASL Check
  if (ctx.ability.cannot('update', 'Matter')) {
    return forbidden('You do not have permission to update this matter');
  }

  // Verify user has access to matter
  const matterResult = await mattersService.getMatterById(matterId, ctx);
  if (!matterResult.success) {
    return matterResult as Result<never>;
  }

  try {
    // Verify note exists and belongs to matter
    const note = await matterNotesQueries.findMatterNoteById(params.noteId);
    if (!note || note.matter_id !== matterId) {
      return notFound('Note not found');
    }

    await matterNotesQueries.deleteMatterNote(params.noteId);

    // Log activity
    const userName = ctx.user?.name || ctx.user?.email || 'Unknown User';
    const activityResult = await matterActivityService.logMatterActivity(
      {
        action: matterActivityService.ActivityAction.NOTE_DELETED,
        description: `${userName} deleted a note`,
        metadata: { changed_fields: ['deleted'] },
      },
      ctx,
    );
    if (!activityResult.success) {
      return activityResult as Result<{ success: true }>;
    }

    return ok({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to delete matter note {noteId}: {error}', {
      noteId: params.noteId,
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
