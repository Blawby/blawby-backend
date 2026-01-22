import { AppRouteHandler } from '@/shared/types/hono';
import { response } from '@/shared/utils/responseUtils';
import { auditLogsRepository } from '@/modules/uploads/database/queries/audit-logs.repository';
import { uploadsRepository } from '@/modules/uploads/database/queries/uploads.repository';
import { logError } from '@/shared/middleware/logger';
import { getAuditLogRoute } from '@/modules/uploads/routes';

export const getAuditLogHandler: AppRouteHandler<typeof getAuditLogRoute> = async (c) => {
  const { id } = c.req.valid('param');
  const organizationId = c.get('activeOrganizationId');

  if (!organizationId) {
    return response.badRequest(c, 'Organization context required');
  }

  try {
    // Verify upload belongs to organization
    const upload = await uploadsRepository.findById(id);
    if (!upload) {
      return response.notFound(c, 'Upload not found');
    }

    if (upload.organizationId !== organizationId) {
      return response.forbidden(c, 'Access denied');
    }

    // Get audit logs
    const logs = await auditLogsRepository.findByUploadId(id, 100);

    // TODO: Enrich with user names (join with users table)
    const auditLogs = logs.map((log) => ({
      id: log.id,
      upload_id: log.uploadId,
      action: log.action,
      user_id: log.userId,
      user_name: null, // TODO: Fetch from users table
      ip_address: log.ipAddress,
      user_agent: log.userAgent,
      metadata: log.metadata,
      created_at: log.createdAt.toISOString(),
    }));

    return response.ok(c, {
      audit_logs: auditLogs,
      total: auditLogs.length,
    });
  } catch (error) {
    logError(error, {
      method: c.req.method,
      url: c.req.url,
      statusCode: 500,
      organizationId,
    });

    const message = error instanceof Error ? error.message : 'Failed to get audit logs';
    return response.internalServerError(c, message);
  }
};;
