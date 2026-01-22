import { AppRouteHandler } from '@/shared/types/hono';
import { response } from '@/shared/utils/responseUtils';
import { createUploadsService } from '@/modules/uploads/services/uploads.service';
import { logError } from '@/shared/middleware/logger';
import { listUploadsRoute } from '@/modules/uploads/routes';

export const listHandler: AppRouteHandler<typeof listUploadsRoute> = async (c) => {
  const query = c.req.valid('query');
  const organizationId = c.get('activeOrganizationId');

  if (!organizationId) {
    return response.badRequest(c, 'Organization context required');
  }

  try {
    const uploadsService = createUploadsService();
    const result = await uploadsService.listUploads(organizationId, query);

    return response.ok(c, result);
  } catch (error) {
    logError(error, {
      method: c.req.method,
      url: c.req.url,
      statusCode: 400,
      organizationId,
    });

    const message = error instanceof Error ? error.message : 'Failed to list uploads';
    return response.badRequest(c, message);
  }
};
