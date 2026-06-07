import { auditLogsRepository } from '@/shared/uploads/queries/audit-logs.repository';
import type { InsertUploadAuditLog } from '@/shared/uploads/schema/upload-audit-logs.schema';
import type { AuditAction } from '@/shared/uploads/types/uploads.types';

export const auditService = {
  async log(params: {
    upload_id: string;
    organization_id?: string;
    action: AuditAction;
    user_id?: string;
    ip_address?: string;
    user_agent?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    const auditLog: InsertUploadAuditLog = {
      upload_id: params.upload_id,
      organization_id: params.organization_id,
      action: params.action,
      user_id: params.user_id,
      ip_address: params.ip_address,
      user_agent: params.user_agent,
      metadata: params.metadata ?? null,
    };

    try {
      await auditLogsRepository.create(auditLog);
    } catch (err) {
      // Audit failures must not break the primary flow
      const { getLogger } = await import('@logtape/logtape');
      getLogger(['uploads', 'audit-service']).error('Failed to write audit log: {err}', { err, ...params });
    }
  },
};
