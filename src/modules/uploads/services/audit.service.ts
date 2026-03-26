/**
 * Audit Service
 *
 * Handles audit logging for compliance (ABA/IOLTA)
 */

import type { AuditAction } from '@/modules/uploads/types/uploads.types';
import { auditLogsRepository } from '@/modules/uploads/database/queries/audit-logs.repository';
import type { InsertUploadAuditLog } from '@/modules/uploads/database/schema/upload-audit-logs.schema';

/**
 * Audit Service
 */
export const auditService = {
  /**
   * Create a new audit log entry
   */
  async createAuditLog(params: {
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
      metadata: params.metadata || null,
    };

    await auditLogsRepository.create(auditLog);
  },
};

// Legacy export
export const createAuditLog = auditService.createAuditLog;
