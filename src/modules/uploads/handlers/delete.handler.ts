import type { deleteUploadRoute } from '@/modules/uploads/routes';
import { uploadsService } from '@/modules/uploads/services/uploads.service';
import type { AppRouteHandler } from '@/shared/types/hono';
import { response } from '@/shared/utils/responseUtils';

export const deleteHandler: AppRouteHandler<typeof deleteUploadRoute> = async (c) => {
  const { id } = c.req.valid('param');
  const userId = c.get('userId');
  const validatedBody = c.req.valid('json');

  if (!userId) {
    return response.unauthorized(c, 'Authentication required');
  }

  const result = await uploadsService.deleteUpload(id, userId, validatedBody);
  return response.fromResult(c, result);
};
