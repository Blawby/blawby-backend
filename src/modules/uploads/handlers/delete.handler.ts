import type { routes } from '@/modules/uploads/routes';
import { uploadsService } from '@/modules/uploads/services/uploads.service';
import type { AppRouteHandler } from '@/shared/types/hono';
import { getServiceContext } from '@/shared/types/service-context';
import { sendResult } from '@/shared/utils/responseUtils';

const deleteHandler: AppRouteHandler<typeof routes.deleteUploadRoute> = async (c) => {
  const { id } = c.req.valid('param');
  const validatedBody = c.req.valid('json');
  const ctx = getServiceContext(c);
  const result = await uploadsService.deleteUpload({ id, request: validatedBody }, ctx);
  return sendResult(c, result);
};

export const deleteHandlers = {
  deleteHandler,
};
