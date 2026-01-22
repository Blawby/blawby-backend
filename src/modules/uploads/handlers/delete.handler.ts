import { AppRouteHandler } from '@/shared/types/hono';
import { response } from '@/shared/utils/responseUtils';
import { uploadsService } from '@/modules/uploads/services/uploads.service';
import { deleteUploadRoute } from '@/modules/uploads/routes';

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
