import { createRoute, z } from '@hono/zod-openapi';

import {
  presignUploadSchema,
  uploadIdParamSchema,
  deleteUploadSchema,
  listUploadsQuerySchema,
  presignUploadResponseSchema,
  confirmUploadResponseSchema,
  uploadDetailsResponseSchema,
  downloadUrlResponseSchema,
  listUploadsResponseSchema,
  auditLogResponseSchema,
  errorResponseSchema,
  notFoundResponseSchema,
  internalServerErrorResponseSchema,
} from '@/modules/uploads/validations/uploads.validation';

/**
 * OpenAPI param schemas with metadata
 */
const uploadIdParamOpenAPISchema = z.object({
  id: z
    .uuid()
    .openapi({
      param: {
        name: 'id',
        in: 'path',
      },
      description: 'Upload ID (UUID)',
      example: '123e4567-e89b-12d3-a456-426614174000',
    }),
});

/**
 * POST /api/uploads/presign
 * Generate presigned URL for upload
 */
export const presignUploadRoute = createRoute({
  method: 'post',
  path: '/presign',
  tags: ['Uploads'],
  summary: 'Generate presigned upload URL',
  description: 'Generates a presigned URL for direct upload to Cloudflare R2 or Images',
  request: {
    body: {
      content: {
        'application/json': {
          schema: presignUploadSchema,
        },
      },
    },
  },
  responses: {
    201: {
      content: {
        'application/json': {
          schema: presignUploadResponseSchema,
        },
      },
      description: 'Presigned URL generated successfully',
    },
    400: {
      content: {
        'application/json': {
          schema: errorResponseSchema,
        },
      },
      description: 'Bad request - validation failed',
    },
    401: {
      content: {
        'application/json': {
          schema: errorResponseSchema,
        },
      },
      description: 'Unauthorized',
    },
    500: {
      content: {
        'application/json': {
          schema: internalServerErrorResponseSchema,
        },
      },
      description: 'Internal server error',
    },
  },
});

/**
 * POST /api/uploads/:id/confirm
 * Confirm upload completion
 */
export const confirmUploadRoute = createRoute({
  method: 'post',
  path: '/{id}/confirm',
  tags: ['Uploads'],
  summary: 'Confirm upload completion',
  description: 'Confirms that an upload has been completed and verifies the file exists',
  request: {
    params: uploadIdParamOpenAPISchema,
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: confirmUploadResponseSchema,
        },
      },
      description: 'Upload confirmed successfully',
    },
    400: {
      content: {
        'application/json': {
          schema: errorResponseSchema,
        },
      },
      description: 'Bad request - upload not found or already confirmed',
    },
    404: {
      content: {
        'application/json': {
          schema: notFoundResponseSchema,
        },
      },
      description: 'Upload not found',
    },
    500: {
      content: {
        'application/json': {
          schema: internalServerErrorResponseSchema,
        },
      },
      description: 'Internal server error',
    },
  },
});

/**
 * GET /api/uploads/:id
 * Get upload details
 */
export const getUploadRoute = createRoute({
  method: 'get',
  path: '/{id}',
  tags: ['Uploads'],
  summary: 'Get upload details',
  description: 'Retrieves details for a specific upload',
  request: {
    params: uploadIdParamOpenAPISchema,
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: uploadDetailsResponseSchema,
        },
      },
      description: 'Upload details retrieved successfully',
    },
    404: {
      content: {
        'application/json': {
          schema: notFoundResponseSchema,
        },
      },
      description: 'Upload not found',
    },
    500: {
      content: {
        'application/json': {
          schema: internalServerErrorResponseSchema,
        },
      },
      description: 'Internal server error',
    },
  },
});

/**
 * GET /api/uploads/:id/download
 * Get download URL
 */
export const getDownloadUrlRoute = createRoute({
  method: 'get',
  path: '/{id}/download',
  tags: ['Uploads'],
  summary: 'Get download URL',
  description: 'Generates a presigned download URL for a verified upload',
  request: {
    params: uploadIdParamOpenAPISchema,
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: downloadUrlResponseSchema,
        },
      },
      description: 'Download URL generated successfully',
    },
    400: {
      content: {
        'application/json': {
          schema: errorResponseSchema,
        },
      },
      description: 'Bad request - upload not verified',
    },
    404: {
      content: {
        'application/json': {
          schema: notFoundResponseSchema,
        },
      },
      description: 'Upload not found',
    },
    500: {
      content: {
        'application/json': {
          schema: internalServerErrorResponseSchema,
        },
      },
      description: 'Internal server error',
    },
  },
});

/**
 * DELETE /api/uploads/:id
 * Soft delete upload
 */
export const deleteUploadRoute = createRoute({
  method: 'delete',
  path: '/{id}',
  tags: ['Uploads'],
  summary: 'Delete upload',
  description: 'Soft deletes an upload with a reason (for compliance)',
  request: {
    params: uploadIdParamOpenAPISchema,
    body: {
      content: {
        'application/json': {
          schema: deleteUploadSchema,
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: z.object({
            message: z.string(),
          }),
        },
      },
      description: 'Upload deleted successfully',
    },
    400: {
      content: {
        'application/json': {
          schema: errorResponseSchema,
        },
      },
      description: 'Bad request - validation failed or upload already deleted',
    },
    404: {
      content: {
        'application/json': {
          schema: notFoundResponseSchema,
        },
      },
      description: 'Upload not found',
    },
    500: {
      content: {
        'application/json': {
          schema: internalServerErrorResponseSchema,
        },
      },
      description: 'Internal server error',
    },
  },
});

/**
 * POST /api/uploads/:id/restore
 * Restore soft-deleted upload
 */
export const restoreUploadRoute = createRoute({
  method: 'post',
  path: '/{id}/restore',
  tags: ['Uploads'],
  summary: 'Restore upload',
  description: 'Restores a soft-deleted upload',
  request: {
    params: uploadIdParamOpenAPISchema,
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: z.object({
            message: z.string(),
          }),
        },
      },
      description: 'Upload restored successfully',
    },
    400: {
      content: {
        'application/json': {
          schema: errorResponseSchema,
        },
      },
      description: 'Bad request - upload not deleted',
    },
    404: {
      content: {
        'application/json': {
          schema: notFoundResponseSchema,
        },
      },
      description: 'Upload not found',
    },
    500: {
      content: {
        'application/json': {
          schema: internalServerErrorResponseSchema,
        },
      },
      description: 'Internal server error',
    },
  },
});

/**
 * GET /api/uploads
 * List uploads
 */
export const listUploadsRoute = createRoute({
  method: 'get',
  path: '/',
  tags: ['Uploads'],
  summary: 'List uploads',
  description: 'Lists uploads for the current organization with optional filters',
  request: {
    query: listUploadsQuerySchema,
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: listUploadsResponseSchema,
        },
      },
      description: 'Uploads retrieved successfully',
    },
    400: {
      content: {
        'application/json': {
          schema: errorResponseSchema,
        },
      },
      description: 'Bad request - validation failed',
    },
    500: {
      content: {
        'application/json': {
          schema: internalServerErrorResponseSchema,
        },
      },
      description: 'Internal server error',
    },
  },
});

/**
 * GET /api/uploads/:id/audit-log
 * Get audit log for upload
 */
export const getAuditLogRoute = createRoute({
  method: 'get',
  path: '/{id}/audit-log',
  tags: ['Uploads'],
  summary: 'Get audit log',
  description: 'Retrieves the audit log for a specific upload',
  request: {
    params: uploadIdParamOpenAPISchema,
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: auditLogResponseSchema,
        },
      },
      description: 'Audit log retrieved successfully',
    },
    404: {
      content: {
        'application/json': {
          schema: notFoundResponseSchema,
        },
      },
      description: 'Upload not found',
    },
    500: {
      content: {
        'application/json': {
          schema: internalServerErrorResponseSchema,
        },
      },
      description: 'Internal server error',
    },
  },
});
