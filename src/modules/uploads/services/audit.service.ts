/**
 * Audit Service
 *
 * Handles audit logging for compliance (ABA/IOLTA)
 */

import type { AuditAction } from '@/modules/uploads/types/uploads.types';
import { auditLogsRepository } from '@/modules/uploads/database/queries/audit-logs.repository';
import type { InsertUploadAuditLog } from '@/modules/uploads/database/schema/upload-audit-logs.schema';

export const createAuditLog = async function createAuditLog(params: {
  uploadId: string;
  organizationId?: string;
  action: AuditAction;
  userId?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const auditLog: InsertUploadAuditLog = {
    uploadId: params.uploadId,
    organizationId: params.organizationId,
    action: params.action,
    userId: params.userId,
    ipAddress: params.ipAddress,
    userAgent: params.userAgent,
    metadata: params.metadata || null,
  };

  await auditLogsRepository.create(auditLog);
};
