import type { AppRouteHandler } from '@/shared/types/hono';
import { uploadsService } from '@/modules/uploads/services/uploads.service';
import { getServiceContext } from '@/shared/types/service-context';
import { sendResult } from '@/shared/utils/responseUtils';
import type { routes } from '@/modules/uploads/routes';

const listHandler: AppRouteHandler<typeof routes.listUploadsRoute> = async (c) => {
  const query = c.req.valid('query');
  const ctx = getServiceContext(c);
  const result = await uploadsService.listUploads({ query }, ctx);
  return sendResult(c, result);
};

export const listHandlers = {
  listHandler,
};
