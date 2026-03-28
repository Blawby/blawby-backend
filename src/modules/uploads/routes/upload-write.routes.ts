import { z } from '@hono/zod-openapi';
import { uploadValidations } from '@/modules/uploads/validations/uploads.validation';
import { routeBuilder } from '@/shared/router/route-builder';

const uploadIdParamOpenAPISchema = z.object({
  id: z.uuid().openapi({
    param: {
      name: 'id',
      in: 'path',
    },
    description: 'Upload ID (UUID)',
    example: '123e4567-e89b-12d3-a456-426614174000',
  }),
});

const uploadMutationResponseSchema = z.object({
  message: z.string(),
});

const presignUploadRoute = routeBuilder.build({
  method: 'post',
  path: '/presign',
  tags: ['Uploads'],
  summary: 'Generate presigned upload URL',
  description: 'Generates a presigned URL for direct upload to Cloudflare R2 or Images',
  security: [{ Bearer: [] }],
  request: {
    body: {
      content: {
        'application/json': {
          schema: uploadValidations.presignUploadSchema,
        },
      },
    },
  },
  responses: {
    201: {
      content: {
        'application/json': {
          schema: uploadValidations.presignUploadResponseSchema,
        },
      },
      description: 'Presigned URL generated successfully',
    },
  },
});

const confirmUploadRoute = routeBuilder.build({
  method: 'post',
  path: '/{id}/confirm',
  tags: ['Uploads'],
  summary: 'Confirm upload completion',
  description: 'Confirms that an upload has been completed and verifies the file exists',
  security: [{ Bearer: [] }],
  request: {
    params: uploadIdParamOpenAPISchema,
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: uploadValidations.confirmUploadResponseSchema,
        },
      },
      description: 'Upload confirmed successfully',
    },
  },
});

const deleteUploadRoute = routeBuilder.build({
  method: 'delete',
  path: '/{id}',
  tags: ['Uploads'],
  summary: 'Delete upload',
  description: 'Soft deletes an upload with a reason (for compliance)',
  security: [{ Bearer: [] }],
  request: {
    params: uploadIdParamOpenAPISchema,
    body: {
      content: {
        'application/json': {
          schema: uploadValidations.deleteUploadSchema,
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: uploadMutationResponseSchema,
        },
      },
      description: 'Upload deleted successfully',
    },
  },
});

const restoreUploadRoute = routeBuilder.build({
  method: 'post',
  path: '/{id}/restore',
  tags: ['Uploads'],
  summary: 'Restore upload',
  description: 'Restores a soft-deleted upload',
  security: [{ Bearer: [] }],
  request: {
    params: uploadIdParamOpenAPISchema,
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: uploadMutationResponseSchema,
        },
      },
      description: 'Upload restored successfully',
    },
  },
});

export const uploadWriteRoutes = {
  presignUploadRoute,
  confirmUploadRoute,
  deleteUploadRoute,
  restoreUploadRoute,
};
