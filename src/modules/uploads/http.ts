import { OpenAPIHono } from '@hono/zod-openapi';
import { zValidator } from '@hono/zod-validator';

import * as routes from '@/modules/uploads/routes';
import {
  presignUploadSchema,
  uploadIdParamSchema,
  deleteUploadSchema,
  listUploadsQuerySchema,
} from '@/modules/uploads/validations/uploads.validation';
import type { AppContext } from '@/shared/types/hono';

import { presignHandler } from '@/modules/uploads/handlers/presign.handler';
import { confirmHandler } from '@/modules/uploads/handlers/confirm.handler';
import { getHandler } from '@/modules/uploads/handlers/get.handler';
import { downloadHandler } from '@/modules/uploads/handlers/download.handler';
import { deleteHandler } from '@/modules/uploads/handlers/delete.handler';
import { restoreHandler } from '@/modules/uploads/handlers/restore.handler';
import { listHandler } from '@/modules/uploads/handlers/list.handler';
import { getAuditLogHandler } from '@/modules/uploads/handlers/audit-log.handler';

const uploadsApp = new OpenAPIHono<AppContext>();

/**
 * POST /api/uploads/presign
 * Generate presigned URL for upload
 */
uploadsApp.post('/presign', zValidator('json', presignUploadSchema), presignHandler);

// Register OpenAPI route for documentation only
uploadsApp.openapi(routes.presignUploadRoute, async () => {
  throw new Error('This should never be called');
});

/**
 * POST /api/uploads/:id/confirm
 * Confirm upload completion
 */
uploadsApp.post('/:id/confirm', zValidator('param', uploadIdParamSchema), confirmHandler);

// Register OpenAPI route for documentation only
uploadsApp.openapi(routes.confirmUploadRoute, async () => {
  throw new Error('This should never be called');
});

/**
 * GET /api/uploads/:id
 * Get upload details
 */
uploadsApp.get('/:id', zValidator('param', uploadIdParamSchema), getHandler);

// Register OpenAPI route for documentation only
uploadsApp.openapi(routes.getUploadRoute, async () => {
  throw new Error('This should never be called');
});

/**
 * GET /api/uploads/:id/download
 * Get download URL
 */
uploadsApp.get('/:id/download', zValidator('param', uploadIdParamSchema), downloadHandler);

// Register OpenAPI route for documentation only
uploadsApp.openapi(routes.getDownloadUrlRoute, async () => {
  throw new Error('This should never be called');
});

/**
 * DELETE /api/uploads/:id
 * Soft delete upload
 */
uploadsApp.delete('/:id', zValidator('param', uploadIdParamSchema), zValidator('json', deleteUploadSchema), deleteHandler);

// Register OpenAPI route for documentation only
uploadsApp.openapi(routes.deleteUploadRoute, async () => {
  throw new Error('This should never be called');
});

/**
 * POST /api/uploads/:id/restore
 * Restore soft-deleted upload
 */
uploadsApp.post('/:id/restore', zValidator('param', uploadIdParamSchema), restoreHandler);

// Register OpenAPI route for documentation only
uploadsApp.openapi(routes.restoreUploadRoute, async () => {
  throw new Error('This should never be called');
});

/**
 * GET /api/uploads
 * List uploads
 */
uploadsApp.get('/', zValidator('query', listUploadsQuerySchema), listHandler);

// Register OpenAPI route for documentation only
uploadsApp.openapi(routes.listUploadsRoute, async () => {
  throw new Error('This should never be called');
});

/**
 * GET /api/uploads/:id/audit-log
 * Get audit log for upload
 */
uploadsApp.get('/:id/audit-log', zValidator('param', uploadIdParamSchema), getAuditLogHandler);

// Register OpenAPI route for documentation only
uploadsApp.openapi(routes.getAuditLogRoute, async () => {
  throw new Error('This should never be called');
});

export default uploadsApp;
