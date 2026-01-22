import { AppRouteHandler } from '@/shared/types/hono';
import { response } from '@/shared/utils/responseUtils';
import { createUploadsService } from '@/modules/uploads/services/uploads.service';
import { logError } from '@/shared/middleware/logger';
import { getDownloadUrlRoute } from '@/modules/uploads/routes';

export const downloadHandler: AppRouteHandler<typeof getDownloadUrlRoute> = async (c) => {
  const { id } = c.req.valid('param');
  const userId = c.get('userId');

  // Handle comma-separated x-forwarded-for header (take first IP)
  const forwardedFor = c.req.header('x-forwarded-for');
  const ipAddress = forwardedFor
    ? forwardedFor.split(',')[0]?.trim()
    : c.req.header('cf-connecting-ip') || c.req.header('x-real-ip');

  const userAgent = c.req.header('user-agent');

  if (!userId) {
    return response.unauthorized(c, 'Authentication required');
  }

  try {
    const uploadsService = createUploadsService();
    const result = await uploadsService.getDownloadUrl(id, userId, ipAddress || undefined, userAgent || undefined);

    return response.ok(c, result);
  } catch (error) {
    logError(error, {
      method: c.req.method,
      url: c.req.url,
      statusCode: 500,
      userId,
    });

    const message = error instanceof Error ? error.message : 'Failed to get download URL';
    if (message.includes('not found')) {
      return response.notFound(c, message);
    }
    return response.internalServerError(c, message);
  }
};
