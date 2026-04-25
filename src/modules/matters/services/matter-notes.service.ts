import { ForbiddenError } from '@casl/ability';
import { HTTPException } from 'hono/http-exception';
import { matterNotesQueries } from '@/modules/matters/database/queries/matter-notes.queries';
import type { SelectMatterNote } from '@/modules/matters/database/schema/matter-notes.schema';
import { matterActivityService } from '@/modules/matters/services/matter-activity.service';
import { mattersService } from '@/modules/matters/services/matters.service';
import type { MatterNoteListFilters } from '@/modules/matters/types/matter-filters.types';
import type { CreateMatterNoteRequest, UpdateMatterNoteRequest } from '@/modules/matters/types/matter.types';
import type { ServiceContext } from '@/shared/types/service-context';

const createMatterNote = async (
  params: { data: CreateMatterNoteRequest },
  ctx: ServiceContext
): Promise<SelectMatterNote> => {
  const { matterId } = ctx;
  if (!matterId) {
    throw new Error('Matter ID not found in context');
  }

  ForbiddenError.from(ctx.ability).throwUnlessCan('update', 'Matter');
  await mattersService.verifyMatterAccess(matterId, ctx);

  const note = await matterNotesQueries.createMatterNote({
    matter_id: matterId,
    user_id: ctx.userId,
    content: params.data.content,
  });

  const userName = ctx.user?.name || ctx.user?.email || 'Unknown User';
  await matterActivityService.logMatterActivity(
    {
      action: matterActivityService.ActivityAction.NOTE_ADDED,
      description: `${userName} added a note`,
      metadata: { changed_fields: ['content'] },
    },
    ctx
  );

  return note;
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

  ForbiddenError.from(ctx.ability).throwUnlessCan('read', 'Matter');
  await mattersService.verifyMatterAccess(matterId, ctx);

  if (params.filters?.noteId) {
    const note = await matterNotesQueries.findMatterNoteById(params.filters.noteId);
    if (!note || note.matter_id !== matterId) {
      return [];
    }
    return [note];
  }

  return await matterNotesQueries.listMatterNotes(matterId, params.filters);
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

  ForbiddenError.from(ctx.ability).throwUnlessCan('update', 'Matter');
  await mattersService.verifyMatterAccess(matterId, ctx);

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
  await matterActivityService.logMatterActivity(
    {
      action: matterActivityService.ActivityAction.NOTE_UPDATED,
      description: `${userName} updated a note`,
      metadata: { changed_fields: changedFields },
    },
    ctx
  );

  return updated;
};

/**
 * Delete matter note
 */
const deleteMatterNote = async (params: { noteId: string }, ctx: ServiceContext): Promise<void> => {
  const { matterId } = ctx;
  if (!matterId) {
    throw new Error('Matter ID not found in context');
  }

  ForbiddenError.from(ctx.ability).throwUnlessCan('update', 'Matter');
  await mattersService.verifyMatterAccess(matterId, ctx);

  const note = await matterNotesQueries.findMatterNoteById(params.noteId);
  if (!note || note.matter_id !== matterId) {
    throw new HTTPException(404, { message: 'Note not found' });
  }

  await matterNotesQueries.deleteMatterNote(params.noteId);

  const userName = ctx.user?.name || ctx.user?.email || 'Unknown User';
  await matterActivityService.logMatterActivity(
    {
      action: matterActivityService.ActivityAction.NOTE_DELETED,
      description: `${userName} deleted a note`,
      metadata: { changed_fields: ['deleted'] },
    },
    ctx
  );
};

export const matterNotesService = {
  createMatterNote,
  listMatterNotes,
  updateMatterNote,
  deleteMatterNote,
};
