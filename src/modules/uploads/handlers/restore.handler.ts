import type { Context } from 'hono';
import type { AppContext } from '@/shared/types/hono';
import { response } from '@/shared/utils/responseUtils';
import { createUploadsService } from '@/modules/uploads/services/uploads.service';

export const restoreHandler = async (c: Context<AppContext>) => {
  const id = c.req.param('id');
  const userId = c.get('userId');

  if (!userId) {
    return response.unauthorized(c, 'Authentication required');
  }

  try {
    const uploadsService = createUploadsService();
    await uploadsService.restoreUpload(id, userId);

    return response.ok(c, { message: 'Upload restored successfully' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to restore upload';
    if (message.includes('not found')) {
      return response.notFound(c, message);
    }
    return response.badRequest(c, message);
  }
};
