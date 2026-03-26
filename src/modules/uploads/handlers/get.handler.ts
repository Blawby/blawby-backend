import type { AppRouteHandler } from '@/shared/types/hono';
import { response } from '@/shared/utils/responseUtils';
import { uploadsService } from '@/modules/uploads/services/uploads.service';
import type { getUploadRoute } from '@/modules/uploads/routes';

export const getHandler: AppRouteHandler<typeof getUploadRoute> = async (c) => {
  const { id } = c.req.valid('param');
  const userId = c.get('userId');

  if (!userId) {
    return response.unauthorized(c, 'Authentication required');
  }

  const result = await uploadsService.getUploadDetails(id, userId);
  return response.fromResult(c, result);
};
