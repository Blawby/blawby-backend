import {
  listMatterNotesRoute,
  createMatterNoteRoute,
  updateMatterNoteRoute,
  deleteMatterNoteRoute,
} from '@/modules/matters/routes';
import { matterNotesService } from '@/modules/matters/services/matter-notes.service';
import { AppRouteHandler } from '@/shared/types/hono';
import { response } from '@/shared/utils/responseUtils';

export const listMatterNotesHandler: AppRouteHandler<typeof listMatterNotesRoute> = async (c) => {
  const user = c.get('user')!;
  const { practice_id, id } = c.req.valid('param');
  const result = await matterNotesService.listMatterNotes(practice_id, id, user, c.req.header());
  
  if (result.success) {
    return response.ok(c, { notes: result.data });
  }
  
  return response.fromResult(c, result);
};

export const createMatterNoteHandler: AppRouteHandler<typeof createMatterNoteRoute> = async (c) => {
  const user = c.get('user')!;
  const { practice_id, id } = c.req.valid('param');
  const validatedBody = c.req.valid('json');
  const result = await matterNotesService.createMatterNote(practice_id, id, validatedBody, user, c.req.header());
  
  if (result.success) {
    return response.created(c, { note: result.data });
  }

  return response.fromResult(c, result, 201);
};

export const updateMatterNoteHandler: AppRouteHandler<typeof updateMatterNoteRoute> = async (c) => {
  const user = c.get('user')!;
  const { practice_id, id, noteId } = c.req.valid('param');
  const validatedBody = c.req.valid('json');
  const result = await matterNotesService.updateMatterNote(
    practice_id,
    id,
    noteId,
    validatedBody,
    user,
    c.req.header(),
  );

  if (result.success) {
    return response.ok(c, { note: result.data });
  }

  return response.fromResult(c, result);
};

export const deleteMatterNoteHandler: AppRouteHandler<typeof deleteMatterNoteRoute> = async (c) => {
  const user = c.get('user')!;
  const { practice_id, id, noteId } = c.req.valid('param');
  const result = await matterNotesService.deleteMatterNote(practice_id, id, noteId, user, c.req.header());
  return response.fromResult(c, result);
};
