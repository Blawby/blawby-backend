import { handlers } from '@/modules/uploads/handlers';
import { routes } from '@/modules/uploads/routes';
import { injectAbility } from '@/shared/middleware/inject-ability';
import { createHonoApp } from '@/shared/router/factory';
import { registerOpenApiRoutes } from '@/shared/router/openapi-docs';

const uploadsApp = createHonoApp();
uploadsApp.use('*', injectAbility());

/**
 * POST /api/uploads/presign
 * Generate presigned URL for upload
 */
uploadsApp.openapi(routes.presignUploadRoute, handlers.presignHandler);

/**
 * POST /api/uploads/:id/confirm
 * Confirm upload completion
 */
uploadsApp.openapi(routes.confirmUploadRoute, handlers.confirmHandler);

/**
 * GET /api/uploads/:id
 * Get upload details
 */
uploadsApp.openapi(routes.getUploadRoute, handlers.getHandler);

/**
 * GET /api/uploads/:id/download
 * Get download URL
 */
uploadsApp.openapi(routes.getDownloadUrlRoute, handlers.downloadHandler);

/**
 * DELETE /api/uploads/:id
 * Soft delete upload
 */
uploadsApp.openapi(routes.deleteUploadRoute, handlers.deleteHandler);

/**
 * POST /api/uploads/:id/restore
 * Restore soft-deleted upload
 */
uploadsApp.openapi(routes.restoreUploadRoute, handlers.restoreHandler);

/**
 * GET /api/uploads
 * List uploads
 */
uploadsApp.openapi(routes.listUploadsRoute, handlers.listHandler);

/**
 * GET /api/uploads/:id/audit-log
 * Get audit log for upload
 */
uploadsApp.openapi(routes.getAuditLogRoute, handlers.getAuditLogHandler);

registerOpenApiRoutes(uploadsApp, routes);

export default uploadsApp;
