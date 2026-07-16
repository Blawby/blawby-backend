import type { exportAuditLogRoute, listAuditLogRoute } from '@/modules/audit-log/routes';
import { auditLogService } from '@/modules/audit-log/services/audit-log.service';
import type { AppRouteHandler } from '@/shared/types/hono';
import { getServiceContext } from '@/shared/types/service-context';

export const listAuditLogHandler: AppRouteHandler<typeof listAuditLogRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const query = c.req.valid('query');
  const result = await auditLogService.listAuditLog({ query }, ctx);
  return c.json(result, 200);
};

export const exportAuditLogHandler: AppRouteHandler<typeof exportAuditLogRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const query = c.req.valid('query');
  const csv = await auditLogService.exportAuditLogCsv({ query }, ctx);
  const date = new Date().toISOString().slice(0, 10);
  return c.body(csv, 200, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="blawby-audit-log-${date}.csv"`,
  });
};

export const handlers = { listAuditLogHandler, exportAuditLogHandler };
