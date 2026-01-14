import type { Context } from 'hono';
import type { AppContext } from '@/shared/types/hono';
import { response } from '@/shared/utils/responseUtils';
import { createUploadsService } from '@/modules/uploads/services/uploads.service';
import type { ListUploadsQuery } from '@/modules/uploads/validations/uploads.validation';

export const listHandler = async (c: Context<AppContext>) => {
  const query = c.req.valid('query') as ListUploadsQuery;
  const organizationId = c.get('activeOrganizationId');

  if (!organizationId) {
    return response.badRequest(c, 'Organization context required');
  }

  try {
    const uploadsService = createUploadsService();
    const result = await uploadsService.listUploads(organizationId, query);

    return response.ok(c, result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to list uploads';
    return response.badRequest(c, message);
  }
};
