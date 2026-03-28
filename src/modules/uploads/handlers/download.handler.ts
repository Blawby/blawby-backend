import type { AppRouteHandler } from '@/shared/types/hono';
import { uploadsService } from '@/modules/uploads/services/uploads.service';
import { getServiceContext } from '@/shared/types/service-context';
import { sendResult } from '@/shared/utils/responseUtils';
import type { routes } from '@/modules/uploads/routes';

const downloadHandler: AppRouteHandler<typeof routes.getDownloadUrlRoute> = async (c) => {
  const { id } = c.req.valid('param');
  const ipAddress = c.req.header('x-forwarded-for') ?? c.req.header('remote-addr');
  const userAgent = c.req.header('user-agent');
  const ctx = getServiceContext(c);
  const result = await uploadsService.getDownloadUrl({ uploadId: id, ipAddress, userAgent }, ctx);
  return sendResult(c, result);
};

export const downloadHandlers = {
  downloadHandler,
};
