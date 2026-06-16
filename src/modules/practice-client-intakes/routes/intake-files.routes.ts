import { z } from '@hono/zod-openapi';
import { uuidParamOpenAPISchema } from '@/modules/practice-client-intakes/routes/shared';
import { intakeFilesService } from '@/modules/practice-client-intakes/services/intake-files.service';
import { uploadValidations } from '@/shared/uploads/types/uploads.validation';
import { routeBuilder } from '@/shared/router/route-builder';

const tags = ['Practice Client Intakes'];

const intakeFilePresignRequestSchema = z.object({
  file_name: z.string().min(1).max(255),
  mime_type: z.string().min(1).max(100),
  file_size: z.number().int().positive().max(52_428_800),
});

const intakeFileUploadIdParamSchema = z.object({
  uuid: z.uuid().openapi({ param: { name: 'uuid', in: 'path' } }),
  upload_id: z.uuid().openapi({ param: { name: 'upload_id', in: 'path' } }),
});

const deleteIntakeFileRequestSchema = z.object({
  reason: z.string().min(1).max(255),
});

const deleteIntakeFileResponseSchema = z.object({
  id: z.uuid(),
  status: z.literal('deleted'),
});

const listIntakeFilesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

export const presignIntakeFileRoute = routeBuilder.build({
  method: 'post',
  path: '/{uuid}/files/presign',
  tags,
  summary: 'Generate presigned upload URL for intake file',
  mcp: {
    name: 'presign_intake_file',
    scope: 'intakes:write',
    handler: async (args, ctx) => {
      const { uuid, ...body } = args;
      return intakeFilesService.presignFile(
        { uuid: uuid as string, body: body as Parameters<typeof intakeFilesService.presignFile>[0]['body'] },
        ctx
      );
    },
  },
  request: {
    params: uuidParamOpenAPISchema,
    body: {
      content: { 'application/json': { schema: intakeFilePresignRequestSchema } },
    },
  },
  responses: {
    201: {
      description: 'Presigned URL generated successfully',
      content: { 'application/json': { schema: uploadValidations.presignUploadResponseSchema } },
    },
  },
});

export const confirmIntakeFileRoute = routeBuilder.build({
  method: 'post',
  path: '/{uuid}/files/{upload_id}/confirm',
  tags,
  summary: 'Confirm intake file upload',
  mcp: {
    name: 'confirm_intake_file',
    scope: 'intakes:write',
    handler: async (args, ctx) =>
      intakeFilesService.confirmFile({ uuid: args.uuid as string, uploadId: args.upload_id as string }, ctx),
  },
  request: { params: intakeFileUploadIdParamSchema },
  responses: {
    200: {
      description: 'Upload confirmed successfully',
      content: { 'application/json': { schema: uploadValidations.confirmUploadResponseSchema } },
    },
  },
});

export const listIntakeFilesRoute = routeBuilder.build({
  method: 'get',
  path: '/{uuid}/files',
  tags,
  summary: 'List files for an intake',
  mcp: {
    name: 'list_intake_files',
    scope: 'intakes:read',
    handler: async (args, ctx) =>
      intakeFilesService.listFiles(
        {
          uuid: args.uuid as string,
          query: {
            page: (args.page as number | undefined) ?? 1,
            limit: (args.limit as number | undefined) ?? 20,
          },
        },
        ctx
      ),
  },
  request: {
    params: uuidParamOpenAPISchema,
    query: listIntakeFilesQuerySchema,
  },
  responses: {
    200: {
      description: 'Intake files retrieved successfully',
      content: { 'application/json': { schema: uploadValidations.listUploadsResponseSchema } },
    },
  },
});

export const deleteIntakeFileRoute = routeBuilder.build({
  method: 'delete',
  path: '/{uuid}/files/{upload_id}',
  tags,
  summary: 'Soft delete an intake file',
  mcp: {
    name: 'delete_intake_file',
    scope: 'intakes:write',
    handler: async (args, ctx) =>
      intakeFilesService.deleteFile(
        {
          uuid: args.uuid as string,
          uploadId: args.upload_id as string,
          reason: args.reason as string,
        },
        ctx
      ),
  },
  request: {
    params: intakeFileUploadIdParamSchema,
    body: {
      content: { 'application/json': { schema: deleteIntakeFileRequestSchema } },
    },
  },
  responses: {
    200: {
      description: 'Upload deleted successfully',
      content: { 'application/json': { schema: deleteIntakeFileResponseSchema } },
    },
  },
});

export const intakeFileRoutes = {
  presignIntakeFileRoute,
  confirmIntakeFileRoute,
  listIntakeFilesRoute,
  deleteIntakeFileRoute,
};
