import { and, count, desc, eq } from 'drizzle-orm';
import {
  uploadAuditLogs,
  type InsertUploadAuditLog,
  type SelectUploadAuditLog,
} from '@/shared/uploads/schema/upload-audit-logs.schema';
import { getActiveTx } from '@/shared/database/uow';

export const auditLogsRepository = {
  create: async (data: InsertUploadAuditLog): Promise<SelectUploadAuditLog> => {
    const [log] = await getActiveTx().insert(uploadAuditLogs).values(data).returning();
    return log;
  },

  findByUploadId: async (
    uploadId: string,
    options: { limit?: number; offset?: number } = {}
  ): Promise<SelectUploadAuditLog[]> => {
    const { limit = 100, offset = 0 } = options;
    return getActiveTx()
      .select()
      .from(uploadAuditLogs)
      .where(eq(uploadAuditLogs.upload_id, uploadId))
      .orderBy(desc(uploadAuditLogs.created_at))
      .limit(limit)
      .offset(offset);
  },

  countByUploadId: async (uploadId: string): Promise<number> => {
    const [result] = await getActiveTx()
      .select({ count: count() })
      .from(uploadAuditLogs)
      .where(eq(uploadAuditLogs.upload_id, uploadId));

    return result?.count ?? 0;
  },

  findByOrganization: async (
    organizationId: string,
    options: { uploadId?: string; action?: string; userId?: string; limit?: number; offset?: number } = {}
  ): Promise<SelectUploadAuditLog[]> => {
    const conditions = [eq(uploadAuditLogs.organization_id, organizationId)];

    if (options.uploadId) {
      conditions.push(eq(uploadAuditLogs.upload_id, options.uploadId));
    }

    if (options.action) {
      conditions.push(eq(uploadAuditLogs.action, options.action));
    }

    if (options.userId) {
      conditions.push(eq(uploadAuditLogs.user_id, options.userId));
    }

    return getActiveTx()
      .select()
      .from(uploadAuditLogs)
      .where(and(...conditions))
      .orderBy(desc(uploadAuditLogs.created_at))
      .limit(options.limit ?? 100)
      .offset(options.offset ?? 0);
  },
};
