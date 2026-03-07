import { z } from '@hono/zod-openapi';
import {
  createMatterNoteRequestSchema,
  updateMatterNoteRequestSchema,
  matterNoteResponseSchema,
  listMatterNotesQuerySchema,
} from '@/modules/matters/types/matter.types';
import { routeBuilder } from '@/shared/router/route-builder';

const tags = ['Matters'];

export const listMatterNotesRoute = routeBuilder.build({
  method: 'get',
  path: '/{practice_id}/matters/{id}/notes',
  tags,
  summary: 'List matter notes',
  request: {
    params: z.object({
      practice_id: z.uuid(),
      id: z.uuid(),
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
  path: '/{practice_id}/matters/{id}/notes',
  tags,
  summary: 'Create a matter note',
  request: {
    params: z.object({
      practice_id: z.uuid(),
      id: z.uuid(),
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
  path: '/{practice_id}/matters/{id}/notes/{note_id}',
  tags,
  summary: 'Update a matter note',
  request: {
    params: z.object({
      practice_id: z.uuid(),
      id: z.uuid(),
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
  path: '/{practice_id}/matters/{id}/notes/{note_id}',
  tags,
  summary: 'Delete a matter note',
  request: {
    params: z.object({
      practice_id: z.uuid(),
      id: z.uuid(),
      note_id: z.uuid(),
    }),
  },
  responses: {
    200: {
      description: 'Note deleted successfully',
      content: {
        'application/json': {
          schema: z.object({
            success: z.boolean(),
          }),
        },
      },
    },
  },
});
