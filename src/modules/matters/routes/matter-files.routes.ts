import { z } from '@hono/zod-openapi';
import { matterFilesService } from '@/modules/matters/services/matter-files.service';
import { routeBuilder } from '@/shared/router/route-builder';

const tags = ['Matters'];

const linkMatterFileRequestSchema = z.object({
  upload_id: z.uuid(),
});

const matterFileSchema = z.object({
  id: z.uuid(),
  matter_id: z.uuid(),
  upload_id: z.uuid(),
  linked_by: z.uuid().nullable(),
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
  mcp: {
    name: 'link_matter_file',
    scope: 'matters:write',
    handler: async (args, ctx) =>
      matterFilesService.linkUpload({ matterId: args.matter_id as string, uploadId: args.upload_id as string }, ctx),
  },
  request: {
    params: z.object({
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
  mcp: {
    name: 'list_matter_files',
    scope: 'matters:read',
    handler: async (args, ctx) => matterFilesService.listMatterFiles({ matterId: args.matter_id as string }, ctx),
  },
  request: {
    params: z.object({
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
  mcp: {
    name: 'unlink_matter_file',
    scope: 'matters:write',
    handler: async (args, ctx) => {
      await matterFilesService.unlinkUpload(
        { matterId: args.matter_id as string, uploadId: args.upload_id as string },
        ctx
      );
      return { unlinked: true };
    },
  },
  request: {
    params: z.object({
      matter_id: z.uuid(),
      upload_id: z.uuid(),
    }),
  },
  responses: {
    204: {
      description: 'Upload unlinked from matter successfully',
    },
  },
});
