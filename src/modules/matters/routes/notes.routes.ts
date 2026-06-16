import { z } from '@hono/zod-openapi';
import {
  createMatterNoteRequestSchema,
  updateMatterNoteRequestSchema,
  matterNoteResponseSchema,
  listMatterNotesQuerySchema,
} from '@/modules/matters/types/matter.types';
import { matterNotesService } from '@/modules/matters/services/matter-notes.service';
import { routeBuilder } from '@/shared/router/route-builder';

const tags = ['Matters'];

export const listMatterNotesRoute = routeBuilder.build({
  method: 'get',
  path: '/{matter_id}/notes',
  tags,
  summary: 'List matter notes',
  mcp: {
    name: 'list_matter_notes',
    scope: 'matters:read',
    handler: async (args, ctx) => {
      const matterId = args.matter_id as string;
      const scopedCtx = { ...ctx, matterId };
      return matterNotesService.listMatterNotes({ filters: { noteId: args.note_id as string | undefined } }, scopedCtx);
    },
  },
  request: {
    params: z.object({
      matter_id: z.uuid(),
    }),
    query: listMatterNotesQuerySchema,
  },
  responses: {
    200: {
      description: 'Notes retrieved successfully',
      content: {
        'application/json': {
          schema: z.array(matterNoteResponseSchema),
        },
      },
    },
  },
});

export const createMatterNoteRoute = routeBuilder.build({
  method: 'post',
  path: '/{matter_id}/notes',
  tags,
  summary: 'Create a matter note',
  mcp: {
    name: 'create_matter_note',
    scope: 'matters:write',
    handler: async (args, ctx) => {
      const { matter_id, ...data } = args;
      const scopedCtx = { ...ctx, matterId: matter_id as string };
      return matterNotesService.createMatterNote(
        { data: data as Parameters<typeof matterNotesService.createMatterNote>[0]['data'] },
        scopedCtx
      );
    },
  },
  request: {
    params: z.object({
      matter_id: z.uuid(),
    }),
    body: {
      content: {
        'application/json': {
          schema: createMatterNoteRequestSchema,
        },
      },
    },
  },
  responses: {
    201: {
      description: 'Note created successfully',
      content: {
        'application/json': {
          schema: matterNoteResponseSchema,
        },
      },
    },
  },
});

export const updateMatterNoteRoute = routeBuilder.build({
  method: 'put',
  path: '/{matter_id}/notes/{note_id}',
  tags,
  summary: 'Update a matter note',
  mcp: {
    name: 'update_matter_note',
    scope: 'matters:write',
    handler: async (args, ctx) => {
      const { matter_id, note_id, ...data } = args;
      const scopedCtx = { ...ctx, matterId: matter_id as string };
      return matterNotesService.updateMatterNote(
        { noteId: note_id as string, data: data as Parameters<typeof matterNotesService.updateMatterNote>[0]['data'] },
        scopedCtx
      );
    },
  },
  request: {
    params: z.object({
      matter_id: z.uuid(),
      note_id: z.uuid(),
    }),
    body: {
      content: {
        'application/json': {
          schema: updateMatterNoteRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Note updated successfully',
      content: {
        'application/json': {
          schema: matterNoteResponseSchema,
        },
      },
    },
  },
});

export const deleteMatterNoteRoute = routeBuilder.build({
  method: 'delete',
  path: '/{matter_id}/notes/{note_id}',
  tags,
  summary: 'Delete a matter note',
  mcp: {
    name: 'delete_matter_note',
    scope: 'matters:write',
    handler: async (args, ctx) => {
      const scopedCtx = { ...ctx, matterId: args.matter_id as string };
      await matterNotesService.deleteMatterNote({ noteId: args.note_id as string }, scopedCtx);
      return { deleted: true };
    },
  },
  request: {
    params: z.object({
      matter_id: z.uuid(),
      note_id: z.uuid(),
    }),
  },
  responses: {
    204: {
      description: 'Note deleted successfully',
    },
  },
});
