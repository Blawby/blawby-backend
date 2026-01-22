import type { Context } from 'hono';
import type { AppContext } from '@/shared/types/hono';
import { response } from '@/shared/utils/responseUtils';
import { uploadsService } from '@/modules/uploads/services/uploads.service';
import type { DeleteUploadRequest } from '@/modules/uploads/validations/uploads.validation';

export const deleteHandler = async (c: Context<AppContext>) => {
  const id = c.req.param('id');
  const body = (await c.req.json()) as DeleteUploadRequest;
  const userId = c.get('userId');

  if (!userId) {
    return response.unauthorized(c, 'Authentication required');
  }

  const result = await uploadsService.deleteUpload(id, userId, body);

  return response.fromResult(c, result);
};
