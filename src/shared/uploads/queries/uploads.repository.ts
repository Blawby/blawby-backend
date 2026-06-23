import { and, count, desc, eq, isNotNull, isNull, lte } from 'drizzle-orm';
import { uploads, type InsertUpload, type SelectUpload } from '@/shared/uploads/schema/uploads.schema';
import { getActiveTx } from '@/shared/database/uow';

export const uploadsRepository = {
  create: async (data: InsertUpload): Promise<SelectUpload> => {
    const [upload] = await getActiveTx().insert(uploads).values(data).returning();
    return upload;
  },

  findById: async (id: string): Promise<SelectUpload | undefined> => {
    const [result] = await getActiveTx().select().from(uploads).where(eq(uploads.id, id)).limit(1);
    return result;
  },

  update: async (id: string, data: Partial<InsertUpload>): Promise<SelectUpload | undefined> => {
    const [updated] = await getActiveTx().update(uploads).set(data).where(eq(uploads.id, id)).returning();
    return updated;
  },

  listByOrganization: async (
    organizationId: string,
    options: {
      scopeType?: string;
      scopeId?: string;
      status?: string;
      includeDeleted?: boolean;
      userId?: string;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<SelectUpload[]> => {
    const conditions = [eq(uploads.organization_id, organizationId)];

    if (options.scopeType) {
      conditions.push(eq(uploads.scope_type, options.scopeType));
    }

    if (options.scopeId) {
      conditions.push(eq(uploads.scope_id, options.scopeId));
    }

    if (options.status) {
      conditions.push(eq(uploads.status, options.status));
    }

    if (!options.includeDeleted) {
      conditions.push(isNull(uploads.deleted_at));
    }

    if (options.userId) {
      conditions.push(eq(uploads.user_id, options.userId));
    }

    const limit = options.limit ?? 20;
    const offset = options.offset ?? 0;

    return getActiveTx()
      .select()
      .from(uploads)
      .where(and(...conditions))
      .orderBy(desc(uploads.created_at))
      .limit(limit)
      .offset(offset);
  },

  countByOrganization: async (
    organizationId: string,
    options: {
      scopeType?: string;
      scopeId?: string;
      status?: string;
      includeDeleted?: boolean;
      userId?: string;
    } = {}
  ): Promise<number> => {
    const conditions = [eq(uploads.organization_id, organizationId)];

    if (options.scopeType) {
      conditions.push(eq(uploads.scope_type, options.scopeType));
    }

    if (options.scopeId) {
      conditions.push(eq(uploads.scope_id, options.scopeId));
    }

    if (options.status) {
      conditions.push(eq(uploads.status, options.status));
    }

    if (!options.includeDeleted) {
      conditions.push(isNull(uploads.deleted_at));
    }

    if (options.userId) {
      conditions.push(eq(uploads.user_id, options.userId));
    }

    const [result] = await getActiveTx()
      .select({ count: count() })
      .from(uploads)
      .where(and(...conditions));

    return result?.count ?? 0;
  },

  softDelete: async (id: string, deletedBy: string, reason: string): Promise<void> => {
    await getActiveTx()
      .update(uploads)
      .set({
        deleted_at: new Date(),
        deleted_by: deletedBy,
        deletion_reason: reason,
      })
      .where(eq(uploads.id, id));
  },

  restore: async (id: string): Promise<void> => {
    await getActiveTx()
      .update(uploads)
      .set({
        deleted_at: null,
        deleted_by: null,
        deletion_reason: null,
      })
      .where(eq(uploads.id, id));
  },

  updateLastAccessed: async (id: string, userId: string): Promise<void> => {
    await getActiveTx()
      .update(uploads)
      .set({
        last_accessed_at: new Date(),
        last_accessed_by: userId,
      })
      .where(eq(uploads.id, id));
  },

  findExpiredUnconfirmed: async (beforeDate: Date, limit = 500): Promise<SelectUpload[]> =>
    getActiveTx()
      .select()
      .from(uploads)
      .where(and(eq(uploads.status, 'pending'), isNotNull(uploads.expires_at), lte(uploads.expires_at, beforeDate)))
      .limit(limit),
};
