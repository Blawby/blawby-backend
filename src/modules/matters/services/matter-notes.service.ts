import { getLogger } from '@logtape/logtape';
import { HTTPException } from 'hono/http-exception';
import { matterNotesQueries } from '@/modules/matters/database/queries/matter-notes.queries';
import type { SelectMatterNote } from '@/modules/matters/database/schema/matter-notes.schema';
import { matterActivityService } from '@/modules/matters/services/matter-activity.service';
import { mattersService } from '@/modules/matters/services/matters.service';
import type { MatterNoteListFilters } from '@/modules/matters/types/matter-filters.types';
import type { CreateMatterNoteRequest, UpdateMatterNoteRequest } from '@/modules/matters/types/matter.types';
import type { ServiceContext } from '@/shared/types/service-context';

const logger = getLogger(['matters', 'services', 'notes']);

const createMatterNote = async (
  params: { data: CreateMatterNoteRequest },
  ctx: ServiceContext
): Promise<SelectMatterNote> => {
  const { matterId } = ctx;
  if (!matterId) {
    throw new Error('Matter ID not found in context');
  }

  if (ctx.ability.cannot('update', 'Matter')) {
    throw new HTTPException(403, { message: 'You do not have permission to update this matter' });
  }

  const matterResult = await mattersService.verifyMatterAccess(matterId, ctx);
  if (!matterResult.success) {
    throw new HTTPException(matterResult.error.status, { message: matterResult.error.message });
  }

  try {
    const note = await matterNotesQueries.createMatterNote({
      matter_id: matterId,
      user_id: ctx.userId,
      content: params.data.content,
    });

    const userName = ctx.user?.name || ctx.user?.email || 'Unknown User';
    const activityResult = await matterActivityService.logMatterActivity(
      {
        action: matterActivityService.ActivityAction.NOTE_ADDED,
        description: `${userName} added a note`,
        metadata: { changed_fields: ['content'] },
      },
      ctx
    );
    if (!activityResult.success) {
      logger.error('Failed to log note create activity {matterId}: {error}', {
        matterId,
        error: activityResult.error.message,
      });
    }

    return note;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to create matter note {matterId}: {error}', {
      matterId,
      error: message,
    });
    if (error instanceof HTTPException) {
      throw error;
    }
    throw new Error(message, { cause: error });
  }
};

/**
 * List matter notes
 */
const listMatterNotes = async (
  params: { filters?: MatterNoteListFilters },
  ctx: ServiceContext
): Promise<SelectMatterNote[]> => {
  const { matterId } = ctx;
  if (!matterId) {
    throw new Error('Matter ID not found in context');
  }

  if (ctx.ability.cannot('read', 'Matter')) {
    throw new HTTPException(403, { message: 'You do not have permission to read this matter' });
  }

  const matterResult = await mattersService.verifyMatterAccess(matterId, ctx);
  if (!matterResult.success) {
    throw new HTTPException(matterResult.error.status, { message: matterResult.error.message });
  }

  try {
    if (params.filters?.noteId) {
      const note = await matterNotesQueries.findMatterNoteById(params.filters.noteId);
      if (!note || note.matter_id !== matterId) {
        return [];
      }
      return [note];
    }

    return await matterNotesQueries.listMatterNotes(matterId, params.filters);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to list matter notes {matterId}: {error}', {
      matterId,
      error: message,
    });
    if (error instanceof HTTPException) {
      throw error;
    }
    throw new Error(message, { cause: error });
  }
};

/**
 * Update matter note
 */
const updateMatterNote = async (
  params: { noteId: string; data: UpdateMatterNoteRequest },
  ctx: ServiceContext
): Promise<SelectMatterNote> => {
  const { matterId } = ctx;
  if (!matterId) {
    throw new Error('Matter ID not found in context');
  }

  if (ctx.ability.cannot('update', 'Matter')) {
    throw new HTTPException(403, { message: 'You do not have permission to update this matter' });
  }

  const matterResult = await mattersService.verifyMatterAccess(matterId, ctx);
  if (!matterResult.success) {
    throw new HTTPException(matterResult.error.status, { message: matterResult.error.message });
  }

  try {
    const note = await matterNotesQueries.findMatterNoteById(params.noteId);
    if (!note || note.matter_id !== matterId) {
      throw new HTTPException(404, { message: 'Note not found' });
    }

    const updated = await matterNotesQueries.updateMatterNote(params.noteId, params.data);
    if (!updated) {
      throw new HTTPException(404, { message: 'Note not found' });
    }

    const changedFields = [];
    if (params.data.content !== undefined && params.data.content !== note.content) {
      changedFields.push('content');
    }

    const userName = ctx.user?.name || ctx.user?.email || 'Unknown User';
    const activityResult = await matterActivityService.logMatterActivity(
      {
        action: matterActivityService.ActivityAction.NOTE_UPDATED,
        description: `${userName} updated a note`,
        metadata: { changed_fields: changedFields },
      },
      ctx
    );
    if (!activityResult.success) {
      logger.error('Failed to log note update activity {noteId}: {error}', {
        noteId: params.noteId,
        error: activityResult.error.message,
      });
    }

    return updated;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to update matter note {noteId}: {error}', {
      noteId: params.noteId,
      error: message,
    });
    if (error instanceof HTTPException) {
      throw error;
    }
    throw new Error(message, { cause: error });
  }
};

/**
 * Delete matter note
 */
const deleteMatterNote = async (params: { noteId: string }, ctx: ServiceContext): Promise<{ success: true }> => {
  const { matterId } = ctx;
  if (!matterId) {
    throw new Error('Matter ID not found in context');
  }

  if (ctx.ability.cannot('update', 'Matter')) {
    throw new HTTPException(403, { message: 'You do not have permission to update this matter' });
  }

  const matterResult = await mattersService.verifyMatterAccess(matterId, ctx);
  if (!matterResult.success) {
    throw new HTTPException(matterResult.error.status, { message: matterResult.error.message });
  }

  try {
    const note = await matterNotesQueries.findMatterNoteById(params.noteId);
    if (!note || note.matter_id !== matterId) {
      throw new HTTPException(404, { message: 'Note not found' });
    }

    await matterNotesQueries.deleteMatterNote(params.noteId);

    const userName = ctx.user?.name || ctx.user?.email || 'Unknown User';
    const activityResult = await matterActivityService.logMatterActivity(
      {
        action: matterActivityService.ActivityAction.NOTE_DELETED,
        description: `${userName} deleted a note`,
        metadata: { changed_fields: ['deleted'] },
      },
      ctx
    );
    if (!activityResult.success) {
      logger.error('Failed to log note delete activity {noteId}: {error}', {
        noteId: params.noteId,
        error: activityResult.error.message,
      });
    }

    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to delete matter note {noteId}: {error}', {
      noteId: params.noteId,
      error: message,
    });
    if (error instanceof HTTPException) {
      throw error;
    }
    throw new Error(message, { cause: error });
  }
};

export const matterNotesService = {
  createMatterNote,
  listMatterNotes,
  updateMatterNote,
  deleteMatterNote,
};
