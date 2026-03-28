import { eq, and, desc, inArray, count } from 'drizzle-orm';

import {
  uploadAuditLogs,
  type InsertUploadAuditLog,
  type SelectUploadAuditLog,
} from '@/modules/uploads/database/schema/upload-audit-logs.schema';

import { db } from '@/shared/database';

export const auditLogsRepository = {
  create: async function create(data: InsertUploadAuditLog): Promise<SelectUploadAuditLog> {
    const [log] = await db.insert(uploadAuditLogs).values(data).returning();
    return log;
  },

  findByUploadId: async function findByUploadId(uploadId: string, limit = 100): Promise<SelectUploadAuditLog[]> {
    return await db
      .select()
      .from(uploadAuditLogs)
      .where(eq(uploadAuditLogs.upload_id, uploadId))
      .orderBy(desc(uploadAuditLogs.created_at))
      .limit(limit);
  },

  countByUploadId: async function countByUploadId(uploadId: string): Promise<number> {
    const [result] = await db
      .select({ count: count() })
      .from(uploadAuditLogs)
      .where(eq(uploadAuditLogs.upload_id, uploadId));

    return result?.count ?? 0;
  },

  findByOrganization: async function findByOrganization(
    organizationId: string,
    options?: {
      uploadId?: string;
      action?: string;
      userId?: string;
      limit?: number;
      offset?: number;
    }
  ): Promise<SelectUploadAuditLog[]> {
    const conditions = [eq(uploadAuditLogs.organization_id, organizationId)];

    if (options?.uploadId) {
      conditions.push(eq(uploadAuditLogs.upload_id, options.uploadId));
    }

    if (options?.action) {
      conditions.push(eq(uploadAuditLogs.action, options.action));
    }

    if (options?.userId) {
      conditions.push(eq(uploadAuditLogs.user_id, options.userId));
    }

    const limit = options?.limit ?? 100;
    const offset = options?.offset ?? 0;

    return await db
      .select()
      .from(uploadAuditLogs)
      .where(and(...conditions))
      .orderBy(desc(uploadAuditLogs.created_at))
      .limit(limit)
      .offset(offset);
  },

  findByUploadIds: async function findByUploadIds(uploadIds: string[]): Promise<SelectUploadAuditLog[]> {
    if (uploadIds.length === 0) {
      return [];
    }

    return await db
      .select()
      .from(uploadAuditLogs)
      .where(inArray(uploadAuditLogs.upload_id, uploadIds))
      .orderBy(desc(uploadAuditLogs.created_at));
  },
};
