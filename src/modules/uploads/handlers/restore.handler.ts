import { AppRouteHandler } from '@/shared/types/hono';
import { response } from '@/shared/utils/responseUtils';
import { uploadsService } from '@/modules/uploads/services/uploads.service';
import { restoreUploadRoute } from '@/modules/uploads/routes';

export const restoreHandler: AppRouteHandler<typeof restoreUploadRoute> = async (c) => {
  const { id } = c.req.valid('param');
  const userId = c.get('userId');

  if (!userId) {
    return response.unauthorized(c, 'Authentication required');
  }

  const result = await uploadsService.restoreUpload(id, userId);
  return response.fromResult(c, result);
};
