import type { Context } from 'hono';
import type { AppContext } from '@/shared/types/hono';
import { response } from '@/shared/utils/responseUtils';
import { createUploadsService } from '@/modules/uploads/services/uploads.service';
import type { DeleteUploadRequest } from '@/modules/uploads/validations/uploads.validation';

export const deleteHandler = async (c: Context<AppContext>) => {
  const id = c.req.param('id');
  const body = c.req.valid('json') as DeleteUploadRequest;
  const userId = c.get('userId');

  if (!userId) {
    return response.unauthorized(c, 'Authentication required');
  }

  try {
    const uploadsService = createUploadsService();
    await uploadsService.deleteUpload(id, userId, body);

    return response.ok(c, { message: 'Upload deleted successfully' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete upload';
    if (message.includes('not found')) {
      return response.notFound(c, message);
    }
    return response.badRequest(c, message);
  }
};
