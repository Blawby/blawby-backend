import { OpenAPIHono } from '@hono/zod-openapi';
import { zValidator } from '@hono/zod-validator';

import * as routes from './routes';
import {
  presignUploadSchema,
  uploadIdParamSchema,
  deleteUploadSchema,
  listUploadsQuerySchema,
} from './validations/uploads.validation';
import type { AppContext } from '@/shared/types/hono';
import { response } from '@/shared/utils/responseUtils';

import { presignHandler } from './handlers/presign.handler';
import { confirmHandler } from './handlers/confirm.handler';
import { getHandler } from './handlers/get.handler';
import { downloadHandler } from './handlers/download.handler';
import { deleteHandler } from './handlers/delete.handler';
import { restoreHandler } from './handlers/restore.handler';
import { listHandler } from './handlers/list.handler';
import { getAuditLogHandler } from './handlers/audit-log.handler';

const app = new OpenAPIHono<AppContext>();

// POST /presign
app.post('/presign', zValidator('json', presignUploadSchema), presignHandler);
app.openapi(routes.presignUploadRoute, async () => {
  throw new Error('This should never be called');
});

// POST /:id/confirm
app.post(
  '/:id/confirm',
  zValidator('param', uploadIdParamSchema),
  confirmHandler,
);
app.openapi(routes.confirmUploadRoute, async () => {
  throw new Error('This should never be called');
});

// GET /:id
app.get('/:id', zValidator('param', uploadIdParamSchema), getHandler);
app.openapi(routes.getUploadRoute, async () => {
  throw new Error('This should never be called');
});

// GET /:id/download
app.get(
  '/:id/download',
  zValidator('param', uploadIdParamSchema),
  downloadHandler,
);
app.openapi(routes.getDownloadUrlRoute, async () => {
  throw new Error('This should never be called');
});

// DELETE /:id
app.delete(
  '/:id',
  zValidator('param', uploadIdParamSchema),
  zValidator('json', deleteUploadSchema),
  deleteHandler,
);
app.openapi(routes.deleteUploadRoute, async () => {
  throw new Error('This should never be called');
});

// POST /:id/restore
app.post(
  '/:id/restore',
  zValidator('param', uploadIdParamSchema),
  restoreHandler,
);
app.openapi(routes.restoreUploadRoute, async () => {
  throw new Error('This should never be called');
});

// GET /
app.get('/', zValidator('query', listUploadsQuerySchema), listHandler);
app.openapi(routes.listUploadsRoute, async () => {
  throw new Error('This should never be called');
});

// GET /:id/audit-log
app.get(
  '/:id/audit-log',
  zValidator('param', uploadIdParamSchema),
  getAuditLogHandler,
);
app.openapi(routes.getAuditLogRoute, async () => {
  throw new Error('This should never be called');
});

export default app;
