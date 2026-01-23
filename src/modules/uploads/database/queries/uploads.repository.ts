import { eq, and, desc, isNull, isNotNull, lte, count } from 'drizzle-orm';

import {
  uploads,
  type InsertUpload,
  type SelectUpload,
} from '@/modules/uploads/database/schema/uploads.schema';

import { db } from '@/shared/database';

export const uploadsRepository = {
  create: async function create(data: InsertUpload): Promise<SelectUpload> {
    const [upload] = await db.insert(uploads).values(data).returning();
    return upload;
  },

  findById: async function findById(id: string): Promise<SelectUpload | undefined> {
    const [result] = await db
      .select()
      .from(uploads)
      .where(eq(uploads.id, id))
      .limit(1);
    return result;
  },

  findByStorageKey: async function findByStorageKey(
    storageKey: string,
  ): Promise<SelectUpload | undefined> {
    const [result] = await db
      .select()
      .from(uploads)
      .where(eq(uploads.storage_key, storageKey))
      .limit(1);
    return result;
  },

  update: async function update(
    id: string,
    data: Partial<SelectUpload>,
  ): Promise<SelectUpload | null> {
    const [updated] = await db
      .update(uploads)
      .set(data)
      .where(eq(uploads.id, id))
      .returning();
    if (!updated) {
      return null;
    }
    return updated;
  },

  listByOrganization: async function listByOrganization(
    organizationId: string,
    options?: {
      matterId?: string;
      uploadContext?: string;
      entityId?: string;
      status?: string;
      includeDeleted?: boolean;
      limit?: number;
      offset?: number;
    },
  ): Promise<SelectUpload[]> {
    const conditions = [eq(uploads.organization_id, organizationId)];

    if (options?.matterId) {
      conditions.push(eq(uploads.matter_id, options.matterId));
    }

    if (options?.uploadContext) {
      conditions.push(eq(uploads.upload_context, options.uploadContext));
    }

    if (options?.entityId) {
      conditions.push(eq(uploads.entity_id, options.entityId));
    }

    if (options?.status) {
      conditions.push(eq(uploads.status, options.status));
    }

    if (!options?.includeDeleted) {
      conditions.push(isNull(uploads.deleted_at));
    }

    const limit = options?.limit ?? 100;
    const offset = options?.offset ?? 0;

    return await db
      .select()
      .from(uploads)
      .where(and(...conditions))
      .orderBy(desc(uploads.created_at))
      .limit(limit)
      .offset(offset);
  },

  countByOrganization: async function countByOrganization(
    organizationId: string,
    options?: {
      matterId?: string;
      uploadContext?: string;
      entityId?: string;
      status?: string;
      includeDeleted?: boolean;
    },
  ): Promise<number> {
    const conditions = [eq(uploads.organization_id, organizationId)];

    if (options?.matterId) {
      conditions.push(eq(uploads.matter_id, options.matterId));
    }

    if (options?.uploadContext) {
      conditions.push(eq(uploads.upload_context, options.uploadContext));
    }

    if (options?.entityId) {
      conditions.push(eq(uploads.entity_id, options.entityId));
    }

    if (options?.status) {
      conditions.push(eq(uploads.status, options.status));
    }

    if (!options?.includeDeleted) {
      conditions.push(isNull(uploads.deleted_at));
    }

    const [result] = await db
      .select({ count: count() })
      .from(uploads)
      .where(and(...conditions));

    return result?.count ?? 0;
  },

  listByMatter: async function listByMatter(
    matterId: string,
    options?: {
      includeDeleted?: boolean;
      limit?: number;
      offset?: number;
    },
  ): Promise<SelectUpload[]> {
    const conditions = [eq(uploads.matter_id, matterId)];

    if (!options?.includeDeleted) {
      conditions.push(isNull(uploads.deleted_at));
    }

    const limit = options?.limit ?? 100;
    const offset = options?.offset ?? 0;

    return await db
      .select()
      .from(uploads)
      .where(and(...conditions))
      .orderBy(desc(uploads.created_at))
      .limit(limit)
      .offset(offset);
  },

  softDelete: async function softDelete(
    id: string,
    deletedBy: string,
    reason: string,
  ): Promise<SelectUpload> {
    const [updated] = await db
      .update(uploads)
      .set({
        deleted_at: new Date(),
        deleted_by: deletedBy,
        deletion_reason: reason,
      })
      .where(eq(uploads.id, id))
      .returning();
    if (!updated) {
      throw new Error('Upload not found');
    }
    return updated;
  },

  restore: async function restore(id: string): Promise<SelectUpload> {
    const [updated] = await db
      .update(uploads)
      .set({
        deleted_at: null,
        deleted_by: null,
        deletion_reason: null,
      })
      .where(eq(uploads.id, id))
      .returning();
    return updated;
  },

  updateLastAccessed: async function updateLastAccessed(
    id: string,
    userId: string,
  ): Promise<SelectUpload | null> {
    const [updated] = await db
      .update(uploads)
      .set({
        last_accessed_at: new Date(),
        last_accessed_by: userId,
      })
      .where(eq(uploads.id, id))
      .returning();
    if (!updated) {
      return null;
    }
    return updated;
  },

  findExpiredUnconfirmed: async function findExpiredUnconfirmed(
    beforeDate: Date,
  ): Promise<SelectUpload[]> {
    return await db
      .select()
      .from(uploads)
      .where(
        and(
          eq(uploads.status, 'pending'),
          isNotNull(uploads.expires_at),
          lte(uploads.expires_at, beforeDate),
        ),
      );
  },

  findRetentionExpired: async function findRetentionExpired(
    beforeDate: Date,
  ): Promise<SelectUpload[]> {
    return await db
      .select()
      .from(uploads)
      .where(
        and(
          isNotNull(uploads.retention_until),
          lte(uploads.retention_until, beforeDate),
          isNull(uploads.deleted_at),
        ),
      );
  },
};
