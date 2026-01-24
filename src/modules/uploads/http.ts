import { OpenAPIHono } from '@hono/zod-openapi';

import * as routes from '@/modules/uploads/routes';
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

import { createHonoApp } from '@/shared/router/factory';

const uploadsApp = createHonoApp();

/**
 * POST /api/uploads/presign
 * Generate presigned URL for upload
 */
uploadsApp.openapi(routes.presignUploadRoute, presignHandler);


/**
 * POST /api/uploads/:id/confirm
 * Confirm upload completion
 */
uploadsApp.openapi(routes.confirmUploadRoute, confirmHandler);


/**
 * GET /api/uploads/:id
 * Get upload details
 */
uploadsApp.openapi(routes.getUploadRoute, getHandler);


/**
 * GET /api/uploads/:id/download
 * Get download URL
 */
uploadsApp.openapi(routes.getDownloadUrlRoute, downloadHandler);


/**
 * DELETE /api/uploads/:id
 * Soft delete upload
 */
uploadsApp.openapi(routes.deleteUploadRoute, deleteHandler);


/**
 * POST /api/uploads/:id/restore
 * Restore soft-deleted upload
 */
uploadsApp.openapi(routes.restoreUploadRoute, restoreHandler);


/**
 * GET /api/uploads
 * List uploads
 */
uploadsApp.openapi(routes.listUploadsRoute, listHandler);


/**
 * GET /api/uploads/:id/audit-log
 * Get audit log for upload
 */
uploadsApp.openapi(routes.getAuditLogRoute, getAuditLogHandler);

registerOpenApiRoutes(uploadsApp, routes);

export default uploadsApp;
