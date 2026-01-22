import { AppRouteHandler } from '@/shared/types/hono';
import { response } from '@/shared/utils/responseUtils';
import { createUploadsService } from '@/modules/uploads/services/uploads.service';
import { logError } from '@/shared/middleware/logger';
import { confirmUploadRoute } from '@/modules/uploads/routes';

export const confirmHandler: AppRouteHandler<typeof confirmUploadRoute> = async (c) => {
  const { id } = c.req.valid('param');
  const userId = c.get('userId');

  if (!userId) {
    return response.unauthorized(c, 'Authentication required');
  }

  try {
    const uploadsService = createUploadsService();
    const result = await uploadsService.confirmUpload(id, userId);

    return response.ok(c, result);
  } catch (error) {
    logError(error, {
      method: c.req.method,
      url: c.req.url,
      statusCode: 400,
      userId,
    });

    const message = error instanceof Error ? error.message : 'Failed to confirm upload';
    if (message.includes('not found')) {
      return response.notFound(c, message);
    }
    return response.badRequest(c, message);
  }
};
