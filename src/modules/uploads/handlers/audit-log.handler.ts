import type { AppRouteHandler } from '@/shared/types/hono';
import { uploadsService } from '@/modules/uploads/services/uploads.service';
import { getServiceContext } from '@/shared/types/service-context';
import { sendResult } from '@/shared/utils/responseUtils';
import type { routes } from '@/modules/uploads/routes';

const getAuditLogHandler: AppRouteHandler<typeof routes.getAuditLogRoute> = async (c) => {
  const { id } = c.req.valid('param');
  const ctx = getServiceContext(c);
  const result = await uploadsService.getAuditLogs({ uploadId: id }, ctx);
  return sendResult(c, result);
};

export const auditLogHandlers = {
  getAuditLogHandler,
};
