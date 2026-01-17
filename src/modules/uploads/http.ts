import { OpenAPIHono } from '@hono/zod-openapi';
import { zValidator } from '@hono/zod-validator';

import * as routes from '@/modules/uploads/routes';
import {
  presignUploadSchema,
  uploadIdParamSchema,
  deleteUploadSchema,
  listUploadsQuerySchema,
} from '@/modules/uploads/validations/uploads.validation';
import { registerOpenApiRoutes } from '@/shared/router/openapi-docs';
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


/**
 * POST /api/uploads/:id/confirm
 * Confirm upload completion
 */
uploadsApp.post('/:id/confirm', zValidator('param', uploadIdParamSchema), confirmHandler);


/**
 * GET /api/uploads/:id
 * Get upload details
 */
uploadsApp.get('/:id', zValidator('param', uploadIdParamSchema), getHandler);


/**
 * GET /api/uploads/:id/download
 * Get download URL
 */
uploadsApp.get('/:id/download', zValidator('param', uploadIdParamSchema), downloadHandler);


/**
 * DELETE /api/uploads/:id
 * Soft delete upload
 */
uploadsApp.delete('/:id', zValidator('param', uploadIdParamSchema), zValidator('json', deleteUploadSchema), deleteHandler);


/**
 * POST /api/uploads/:id/restore
 * Restore soft-deleted upload
 */
uploadsApp.post('/:id/restore', zValidator('param', uploadIdParamSchema), restoreHandler);


/**
 * GET /api/uploads
 * List uploads
 */
uploadsApp.get('/', zValidator('query', listUploadsQuerySchema), listHandler);


/**
 * GET /api/uploads/:id/audit-log
 * Get audit log for upload
 */
uploadsApp.get('/:id/audit-log', zValidator('param', uploadIdParamSchema), getAuditLogHandler);

registerOpenApiRoutes(uploadsApp, routes);

export default uploadsApp;
