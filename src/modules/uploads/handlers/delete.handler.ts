import { AppRouteHandler } from '@/shared/types/hono';
import { response } from '@/shared/utils/responseUtils';
import { createUploadsService } from '@/modules/uploads/services/uploads.service';
import { logError } from '@/shared/middleware/logger';
import { deleteUploadRoute } from '@/modules/uploads/routes';

export const deleteHandler: AppRouteHandler<typeof deleteUploadRoute> = async (c) => {
  const { id } = c.req.valid('param');
  const body = c.req.valid('json');
  const userId = c.get('userId');

  if (!userId) {
    return response.unauthorized(c, 'Authentication required');
  }

  try {
    const uploadsService = createUploadsService();
    await uploadsService.deleteUpload(id, userId, body);

    return response.ok(c, { message: 'Upload deleted successfully' });
  } catch (error) {
    logError(error, {
      method: c.req.method,
      url: c.req.url,
      statusCode: 400,
      userId,
    });

    const message = error instanceof Error ? error.message : 'Failed to delete upload';
    if (message.includes('not found')) {
      return response.notFound(c, message);
    }
    return response.badRequest(c, message);
  }
};
