import type { Context } from 'hono';
import type { AppContext } from '@/shared/types/hono';
import { response } from '@/shared/utils/responseUtils';
import { uploadsService } from '@/modules/uploads/services/uploads.service';

export const getAuditLogHandler = async (c: Context<AppContext>) => {
  const id = c.req.param('id');
  const organizationId = c.get('activeOrganizationId');

  if (!organizationId) {
    return response.badRequest(c, 'Organization context required');
  }

  const result = await uploadsService.getAuditLogs(id, organizationId);

  return response.fromResult(c, result);
};
