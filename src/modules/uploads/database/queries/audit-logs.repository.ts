import { eq, and, desc, inArray } from 'drizzle-orm';

import {
  uploadAuditLogs,
  type InsertUploadAuditLog,
  type SelectUploadAuditLog,
} from '@/modules/uploads/database/schema/upload-audit-logs.schema';

import { db } from '@/shared/database';

export const auditLogsRepository = {
  create: async function create(
    data: InsertUploadAuditLog,
  ): Promise<SelectUploadAuditLog> {
    const [log] = await db.insert(uploadAuditLogs).values(data).returning();
    return log;
  },

  findByUploadId: async function findByUploadId(
    uploadId: string,
    limit = 100,
  ): Promise<SelectUploadAuditLog[]> {
    return await db
      .select()
      .from(uploadAuditLogs)
      .where(eq(uploadAuditLogs.uploadId, uploadId))
      .orderBy(desc(uploadAuditLogs.createdAt))
      .limit(limit);
  },

  findByOrganization: async function findByOrganization(
    organizationId: string,
    options?: {
      uploadId?: string;
      action?: string;
      userId?: string;
      limit?: number;
      offset?: number;
    },
  ): Promise<SelectUploadAuditLog[]> {
    const conditions = [eq(uploadAuditLogs.organizationId, organizationId)];

    if (options?.uploadId) {
      conditions.push(eq(uploadAuditLogs.uploadId, options.uploadId));
    }

    if (options?.action) {
      conditions.push(eq(uploadAuditLogs.action, options.action));
    }

    if (options?.userId) {
      conditions.push(eq(uploadAuditLogs.userId, options.userId));
    }

    const limit = options?.limit ?? 100;
    const offset = options?.offset ?? 0;

    return await db
      .select()
      .from(uploadAuditLogs)
      .where(and(...conditions))
      .orderBy(desc(uploadAuditLogs.createdAt))
      .limit(limit)
      .offset(offset);
  },

  findByUploadIds: async function findByUploadIds(
    uploadIds: string[],
  ): Promise<SelectUploadAuditLog[]> {
    if (uploadIds.length === 0) {
      return [];
    }

    return await db
      .select()
      .from(uploadAuditLogs)
      .where(inArray(uploadAuditLogs.uploadId, uploadIds))
      .orderBy(desc(uploadAuditLogs.createdAt));
  },
};
