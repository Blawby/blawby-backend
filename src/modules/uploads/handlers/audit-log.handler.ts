import { AppRouteHandler } from '@/shared/types/hono';
import { response } from '@/shared/utils/responseUtils';
import { uploadsService } from '@/modules/uploads/services/uploads.service';
import { getAuditLogRoute } from '@/modules/uploads/routes';

export const getAuditLogHandler: AppRouteHandler<typeof getAuditLogRoute> = async (c) => {
  const { id } = c.req.valid('param');
  const organizationId = c.get('activeOrganizationId');

  if (!organizationId) {
    return response.badRequest(c, 'Organization context required');
  }

  const result = await uploadsService.getAuditLogs(id, organizationId);
  return response.fromResult(c, result);
};
