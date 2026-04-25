import { z } from '@hono/zod-openapi';
import { createHonoApp } from '@/shared/router/factory';
import { injectAbility } from '@/shared/middleware/inject-ability';
import { requireAuth } from '@/shared/middleware/requireAuth';
import { routeBuilder } from '@/shared/router/route-builder';
import { createServiceContext, getServiceContext } from '@/shared/types/service-context';
import { uploadCoreService } from '@/shared/uploads/services/upload-core.service';
import { uploadValidations } from '@/shared/uploads/types/uploads.validation';

const uploadMutationResponseSchema = z.object({
  id: z.uuid(),
  status: z.string(),
});

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

const presignUploadRoute = routeBuilder.build({
  method: 'post',
  path: '/presign',
  tags: ['Uploads'],
  summary: 'Generate presigned upload URL',
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
  security: [{ Bearer: [] }],
  request: { params: uploadIdParamOpenAPISchema },
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

const getUploadRoute = routeBuilder.build({
  method: 'get',
  path: '/{id}',
  tags: ['Uploads'],
  summary: 'Get upload metadata',
  security: [{ Bearer: [] }],
  request: { params: uploadIdParamOpenAPISchema },
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
  summary: 'Get presigned download URL',
  security: [{ Bearer: [] }],
  request: { params: uploadIdParamOpenAPISchema },
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

const deleteUploadRoute = routeBuilder.build({
  method: 'delete',
  path: '/{id}',
  tags: ['Uploads'],
  summary: 'Soft delete upload',
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
  security: [{ Bearer: [] }],
  request: { params: uploadIdParamOpenAPISchema },
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

const listUploadsRoute = routeBuilder.build({
  method: 'get',
  path: '/',
  tags: ['Uploads'],
  summary: 'List uploads',
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
  summary: 'Get upload audit trail',
  security: [{ Bearer: [] }],
  request: { params: uploadIdParamOpenAPISchema },
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

const uploadsHttp = createHonoApp();
uploadsHttp.use('*', requireAuth());
uploadsHttp.use('*', injectAbility());

uploadsHttp.openapi(presignUploadRoute, async (c) => {
  const request = c.req.valid('json');
  const ctx = getServiceContext(c);
  const { db, emit, ...baseCtx } = ctx;

  // External call outside transaction (avoids holding a DB connection during Cloudflare API call)
  const prep = await uploadCoreService.preparePresign({ request }, ctx);
  const result = await db.transaction((tx) =>
    uploadCoreService.persistPresign({ prep, request }, createServiceContext(baseCtx, tx))
  );
  return c.json(result, 201);
});

uploadsHttp.openapi(confirmUploadRoute, async (c) => {
  const { id } = c.req.valid('param');
  const ctx = getServiceContext(c);
  const { db, emit, ...baseCtx } = ctx;

  // DB read + external verify outside transaction; only mutations run inside
  const prep = await uploadCoreService.prepareConfirm({ id }, ctx);
  const result = await db.transaction((tx) =>
    uploadCoreService.persistConfirm({ prep }, createServiceContext(baseCtx, tx))
  );
  return c.json(result, 200);
});

uploadsHttp.openapi(getUploadRoute, async (c) => {
  const { id } = c.req.valid('param');
  const ctx = getServiceContext(c);
  const result = await uploadCoreService.getUpload({ id }, ctx);
  return c.json(result, 200);
});

uploadsHttp.openapi(getDownloadUrlRoute, async (c) => {
  const { id } = c.req.valid('param');
  const ctx = getServiceContext(c);
  const result = await uploadCoreService.getDownloadUrl(
    {
      id,
      ipAddress: c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? c.req.header('cf-connecting-ip'),
      userAgent: c.req.header('user-agent'),
    },
    ctx
  );
  return c.json(result, 200);
});

uploadsHttp.openapi(deleteUploadRoute, async (c) => {
  const { id } = c.req.valid('param');
  const { reason } = c.req.valid('json');
  const ctx = getServiceContext(c);
  const { db, emit, ...baseCtx } = ctx;

  const result = await db.transaction((tx) =>
    uploadCoreService.softDelete({ id, reason }, createServiceContext(baseCtx, tx))
  );
  return c.json(result, 200);
});

uploadsHttp.openapi(restoreUploadRoute, async (c) => {
  const { id } = c.req.valid('param');
  const ctx = getServiceContext(c);
  const { db, emit, ...baseCtx } = ctx;

  const result = await db.transaction((tx) =>
    uploadCoreService.restoreUpload({ id }, createServiceContext(baseCtx, tx))
  );
  return c.json(result, 200);
});

uploadsHttp.openapi(listUploadsRoute, async (c) => {
  const query = c.req.valid('query');
  const ctx = getServiceContext(c);
  const result = await uploadCoreService.listUploads({ query }, ctx);
  return c.json(result, 200);
});

uploadsHttp.openapi(getAuditLogRoute, async (c) => {
  const { id } = c.req.valid('param');
  const ctx = getServiceContext(c);
  const result = await uploadCoreService.getAuditLogs({ id }, ctx);
  return c.json(result, 200);
});

export { uploadsHttp };
export default uploadsHttp;
