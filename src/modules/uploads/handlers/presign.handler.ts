import type { AppRouteHandler } from '@/shared/types/hono';
import { uploadsService } from '@/modules/uploads/services/uploads.service';
import { getServiceContext } from '@/shared/types/service-context';
import { sendResult } from '@/shared/utils/responseUtils';
import type { routes } from '@/modules/uploads/routes';

const presignHandler: AppRouteHandler<typeof routes.presignUploadRoute> = async (c) => {
  const validatedBody = c.req.valid('json');
  const ctx = getServiceContext(c);
  const result = await uploadsService.presignUpload({ request: validatedBody }, ctx);

  return sendResult(c, result, 201);
};

export const presignHandlers = {
  presignHandler,
};
