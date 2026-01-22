import { AppRouteHandler } from '@/shared/types/hono';
import { response } from '@/shared/utils/responseUtils';
import { createUploadsService } from '@/modules/uploads/services/uploads.service';
import { logError } from '@/shared/middleware/logger';
import { restoreUploadRoute } from '@/modules/uploads/routes';

export const restoreHandler: AppRouteHandler<typeof restoreUploadRoute> = async (c) => {
  const { id } = c.req.valid('param');
  const userId = c.get('userId');

  if (!userId) {
    return response.unauthorized(c, 'Authentication required');
  }

  try {
    const uploadsService = createUploadsService();
    await uploadsService.restoreUpload(id, userId);

    return response.ok(c, { message: 'Upload restored successfully' });
  } catch (error) {
    logError(error, {
      method: c.req.method,
      url: c.req.url,
      statusCode: 400,
      userId,
    });

    const message = error instanceof Error ? error.message : 'Failed to restore upload';
    if (message.includes('not found')) {
      return response.notFound(c, message);
    }
    return response.badRequest(c, message);
  }
};
