import { AppRouteHandler } from '@/shared/types/hono';
import { response } from '@/shared/utils/responseUtils';
import { uploadsService } from '@/modules/uploads/services/uploads.service';
import { getDownloadUrlRoute } from '@/modules/uploads/routes';

export const getDownloadUrlHandler: AppRouteHandler<typeof getDownloadUrlRoute> = async (c) => {
  const { id } = c.req.valid('param');
  const userId = c.get('userId');
  const ipAddress = c.req.header('x-forwarded-for') || c.req.header('remote-addr');
  const userAgent = c.req.header('user-agent');

  if (!userId) {
    return response.unauthorized(c, 'Authentication required');
  }

  const result = await uploadsService.getDownloadUrl(id, userId, ipAddress, userAgent);
  return response.fromResult(c, result);
};
