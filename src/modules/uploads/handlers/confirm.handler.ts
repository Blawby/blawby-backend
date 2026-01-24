import { AppRouteHandler } from '@/shared/types/hono';
import { response } from '@/shared/utils/responseUtils';
import { uploadsService } from '@/modules/uploads/services/uploads.service';
import { confirmUploadRoute } from '@/modules/uploads/routes';

export const confirmHandler: AppRouteHandler<typeof confirmUploadRoute> = async (c) => {
  const { id } = c.req.valid('param');
  const userId = c.get('userId');

  if (!userId) {
    return response.unauthorized(c, 'Authentication required');
  }

  const result = await uploadsService.confirmUpload(id, userId);

  return response.fromResult(c, result);
};
