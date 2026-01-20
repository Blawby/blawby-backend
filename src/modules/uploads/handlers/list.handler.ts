import type { Context } from 'hono';
import type { AppContext } from '@/shared/types/hono';
import { response } from '@/shared/utils/responseUtils';
import { uploadsService } from '@/modules/uploads/services/uploads.service';
import type { ListUploadsQuery } from '@/modules/uploads/validations/uploads.validation';

export const listHandler = async (c: Context<AppContext>) => {
  const query = c.req.query() as unknown as ListUploadsQuery;
  const organizationId = c.get('activeOrganizationId');

  if (!organizationId) {
    return response.badRequest(c, 'Organization context required');
  }

  const result = await uploadsService.listUploads(organizationId, query);

  return response.fromResult(c, result);
};
