import { AppRouteHandler } from '@/shared/types/hono';
import { response } from '@/shared/utils/responseUtils';
import { uploadsService } from '@/modules/uploads/services/uploads.service';
import { listUploadsRoute } from '@/modules/uploads/routes';

export const listHandler: AppRouteHandler<typeof listUploadsRoute> = async (c) => {
  const organizationId = c.get('activeOrganizationId');
  const query = c.req.valid('query');

  if (!organizationId) {
    return response.badRequest(c, 'Organization context required');
  }

  const result = await uploadsService.listUploads(organizationId, query);
  return response.fromResult(c, result);
};
