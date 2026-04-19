import { and, count, desc, eq } from 'drizzle-orm';

import { db } from '@/shared/database';
import {
  uploadAuditLogs,
  type InsertUploadAuditLog,
  type SelectUploadAuditLog,
} from '@/shared/uploads/schema/upload-audit-logs.schema';
import type { ServiceContext } from '@/shared/types/service-context';

type DbExecutor = ServiceContext['db'];

export const auditLogsRepository = {
  create: async (data: InsertUploadAuditLog, executor: DbExecutor = db): Promise<SelectUploadAuditLog> => {
    const [log] = await executor.insert(uploadAuditLogs).values(data).returning();
    return log;
  },

  findByUploadId: async (uploadId: string, limit = 100, executor: DbExecutor = db): Promise<SelectUploadAuditLog[]> =>
    executor
      .select()
      .from(uploadAuditLogs)
      .where(eq(uploadAuditLogs.upload_id, uploadId))
      .orderBy(desc(uploadAuditLogs.created_at))
      .limit(limit),

  countByUploadId: async (uploadId: string, executor: DbExecutor = db): Promise<number> => {
    const [result] = await executor
      .select({ count: count() })
      .from(uploadAuditLogs)
      .where(eq(uploadAuditLogs.upload_id, uploadId));

    return result?.count ?? 0;
  },

  findByOrganization: async (
    organizationId: string,
    options: { uploadId?: string; action?: string; userId?: string; limit?: number; offset?: number } = {},
    executor: DbExecutor = db
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

    return executor
      .select()
      .from(uploadAuditLogs)
      .where(and(...conditions))
      .orderBy(desc(uploadAuditLogs.created_at))
      .limit(options.limit ?? 100)
      .offset(options.offset ?? 0);
  },
};
