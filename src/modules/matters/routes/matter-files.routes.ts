import { z } from '@hono/zod-openapi';
import { routeBuilder } from '@/shared/router/route-builder';

const tags = ['Matters'];

const linkMatterFileRequestSchema = z.object({
  upload_id: z.uuid(),
});

const matterFileSchema = z.object({
  id: z.uuid(),
  matter_id: z.uuid(),
  upload_id: z.uuid(),
  linked_by: z.uuid(),
  linked_at: z.date(),
  upload: z.object({
    upload_id: z.uuid(),
    file_name: z.string(),
    file_size: z.number(),
    file_type: z.string(),
    mime_type: z.string(),
    status: z.string(),
    storage_key: z.string(),
    public_url: z.string().nullable(),
    scope_type: z.string().nullable(),
    scope_id: z.uuid().nullable(),
    created_at: z.date(),
  }),
});

export const linkMatterFileRoute = routeBuilder.build({
  method: 'post',
  path: '/{matter_id}/files',
  tags,
  summary: 'Link confirmed upload to matter',
  request: {
    params: z.object({
      practice_id: z.uuid(),
      matter_id: z.uuid(),
    }),
    body: {
      content: {
        'application/json': {
          schema: linkMatterFileRequestSchema,
        },
      },
    },
  },
  responses: {
    201: {
      description: 'Upload linked to matter successfully',
      content: {
        'application/json': {
          schema: matterFileSchema,
        },
      },
    },
  },
});

export const listMatterFilesRoute = routeBuilder.build({
  method: 'get',
  path: '/{matter_id}/files',
  tags,
  summary: 'List files linked to a matter',
  request: {
    params: z.object({
      practice_id: z.uuid(),
      matter_id: z.uuid(),
    }),
  },
  responses: {
    200: {
      description: 'Matter files retrieved successfully',
      content: {
        'application/json': {
          schema: z.array(matterFileSchema),
        },
      },
    },
  },
});

export const unlinkMatterFileRoute = routeBuilder.build({
  method: 'delete',
  path: '/{matter_id}/files/{upload_id}',
  tags,
  summary: 'Unlink upload from matter',
  request: {
    params: z.object({
      practice_id: z.uuid(),
      matter_id: z.uuid(),
      upload_id: z.uuid(),
    }),
  },
  responses: {
    200: {
      description: 'Upload unlinked from matter successfully',
      content: {
        'application/json': {
          schema: z.object({ success: z.boolean() }),
        },
      },
    },
  },
});
