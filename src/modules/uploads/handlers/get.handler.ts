import type { Context } from 'hono';
import type { AppContext } from '@/shared/types/hono';
import { response } from '@/shared/utils/responseUtils';
import { uploadsService } from '@/modules/uploads/services/uploads.service';

export const getHandler = async (c: Context<AppContext>) => {
  const id = c.req.param('id');
  const userId = c.get('userId');

  if (!userId) {
    return response.unauthorized(c, 'Authentication required');
  }

  const result = await uploadsService.getUploadDetails(id, userId);

  return response.fromResult(c, result);
};
