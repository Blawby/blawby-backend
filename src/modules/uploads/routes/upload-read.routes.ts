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

const getUploadRoute = routeBuilder.build({
  method: 'get',
  path: '/{id}',
  tags: ['Uploads'],
  summary: 'Get upload details',
  description: 'Retrieves details for a specific upload',
  security: [{ Bearer: [] }],
  request: {
    params: uploadIdParamOpenAPISchema,
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: uploadValidations.uploadDetailsResponseSchema,
        },
      },
      description: 'Upload details retrieved successfully',
    },
  },
});

const getDownloadUrlRoute = routeBuilder.build({
  method: 'get',
  path: '/{id}/download',
  tags: ['Uploads'],
  summary: 'Get download URL',
  description: 'Generates a presigned download URL for a verified upload',
  security: [{ Bearer: [] }],
  request: {
    params: uploadIdParamOpenAPISchema,
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: uploadValidations.downloadUrlResponseSchema,
        },
      },
      description: 'Download URL generated successfully',
    },
  },
});

const listUploadsRoute = routeBuilder.build({
  method: 'get',
  path: '/',
  tags: ['Uploads'],
  summary: 'List uploads',
  description: 'Lists uploads for the current organization with optional filters',
  security: [{ Bearer: [] }],
  request: {
    query: uploadValidations.listUploadsQuerySchema,
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: uploadValidations.listUploadsResponseSchema,
        },
      },
      description: 'Uploads retrieved successfully',
    },
  },
});

const getAuditLogRoute = routeBuilder.build({
  method: 'get',
  path: '/{id}/audit-log',
  tags: ['Uploads'],
  summary: 'Get audit log',
  description: 'Retrieves the audit log for a specific upload',
  security: [{ Bearer: [] }],
  request: {
    params: uploadIdParamOpenAPISchema,
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: uploadValidations.auditLogResponseSchema,
        },
      },
      description: 'Audit log retrieved successfully',
    },
  },
});

export const uploadReadRoutes = {
  getUploadRoute,
  getDownloadUrlRoute,
  listUploadsRoute,
  getAuditLogRoute,
};
