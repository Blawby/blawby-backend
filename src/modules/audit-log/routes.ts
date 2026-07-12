import { auditLogResponseSchema, listAuditLogQuerySchema } from '@/modules/audit-log/types/audit-log.types';
import { auditLogService } from '@/modules/audit-log/services/audit-log.service';
import { routeBuilder } from '@/shared/router/route-builder';
import { z } from '@hono/zod-openapi';

const practiceParamsSchema = z.object({ practice_id: z.uuid() });
const exportAuditLogQuerySchema = listAuditLogQuerySchema.omit({ cursor: true, limit: true });

export const listAuditLogRoute = routeBuilder.build({
  method: 'get',
  path: '/{practice_id}/audit-log',
  tags: ['Audit Log'],
  summary: 'List authoritative practice audit events',
  description: 'Lists immutable domain, matter-activity, and upload-audit records with explicit provenance.',
  mcp: {
    name: 'list_practice_audit_log',
    scope: 'practice:read',
    schema: listAuditLogQuerySchema.shape,
    handler: async (args, ctx) => auditLogService.listAuditLog({ query: listAuditLogQuerySchema.parse(args) }, ctx),
  },
  request: { params: practiceParamsSchema, query: listAuditLogQuerySchema },
  responses: {
    200: {
      description: 'Cursor-paginated audit events',
      content: { 'application/json': { schema: auditLogResponseSchema } },
    },
  },
});

export const exportAuditLogRoute = routeBuilder.build({
  method: 'get',
  path: '/{practice_id}/audit-log/export',
  tags: ['Audit Log'],
  summary: 'Export authoritative practice audit events as CSV',
  request: { params: practiceParamsSchema, query: exportAuditLogQuerySchema },
  responses: {
    200: {
      description: 'Completed synchronous CSV export',
      content: { 'text/csv': { schema: z.string() } },
    },
  },
});

export const routes = { listAuditLogRoute, exportAuditLogRoute };
