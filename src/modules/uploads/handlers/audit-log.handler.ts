import type { Context } from 'hono';
import type { AppContext } from '@/shared/types/hono';
import { response } from '@/shared/utils/responseUtils';
import { auditLogsRepository } from '@/modules/uploads/database/queries/audit-logs.repository';
import { uploadsRepository } from '@/modules/uploads/database/queries/uploads.repository';

export const getAuditLogHandler = async (c: Context<AppContext>) => {
  const id = c.req.param('id');
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
    const message = error instanceof Error ? error.message : 'Failed to get audit logs';
    return response.badRequest(c, message);
  }
};
