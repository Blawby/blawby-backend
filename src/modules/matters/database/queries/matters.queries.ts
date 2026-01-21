import { eq, and, like, isNull, inArray, sql, desc } from 'drizzle-orm';
import { db } from '@/shared/database';
import {
  matters,
  type InsertMatter,
  type SelectMatter,
} from '../schema/matters.schema';
import { matterAssignees } from '../schema/matter-assignees.schema';
import { users } from '@/schema';

// Create matter
export const createMatter = async (
  data: InsertMatter,
): Promise<SelectMatter> => {
  const [matter] = await db
    .insert(matters)
    .values(data)
    .returning();
  return matter;
};

// Find matter by ID (excluding soft deleted)
export const findMatterById = async (
  id: string,
): Promise<SelectMatter | undefined> => {
  const [matter] = await db
    .select()
    .from(matters)
    .where(and(eq(matters.id, id), isNull(matters.deletedAt)))
    .limit(1);
  return matter;
};

// Find matter by ID (including soft deleted)
export const findMatterByIdWithDeleted = async (
  id: string,
): Promise<SelectMatter | undefined> => {
  const [matter] = await db
    .select()
    .from(matters)
    .where(eq(matters.id, id))
    .limit(1);
  return matter;
};

// List matters by organization with filters
export const listMattersByOrganization = async (
  organizationId: string,
  filters?: {
    status?: string;
    practiceAreaId?: string;
    customerId?: string;
    assigneeId?: string;
    search?: string;
    page?: number;
    limit?: number;
  },
): Promise<{ matters: SelectMatter[]; total: number }> => {
  const page = filters?.page || 1;
  const limit = filters?.limit || 20;
  const offset = (page - 1) * limit;

  let conditions = [
    eq(matters.organizationId, organizationId),
    isNull(matters.deletedAt),
  ];

  if (filters?.status) {
    conditions.push(eq(matters.status, filters.status));
  }

  if (filters?.practiceAreaId) {
    conditions.push(eq(matters.practiceAreaId, filters.practiceAreaId));
  }

  if (filters?.customerId) {
    conditions.push(eq(matters.customerId, filters.customerId));
  }

  if (filters?.search) {
    conditions.push(
      like(matters.title, `%${filters.search}%`),
    );
  }

  let query = db
    .select()
    .from(matters)
    .where(and(...conditions));

  // Handle assignee filter separately with join
  if (filters?.assigneeId) {
    query = db
      .select({
        id: matters.id,
        organizationId: matters.organizationId,
        customerId: matters.customerId,
        title: matters.title,
        description: matters.description,
        billingType: matters.billingType,
        totalFixedPrice: matters.totalFixedPrice,
        contingencyPercentage: matters.contingencyPercentage,
        settlementAmount: matters.settlementAmount,
        practiceAreaId: matters.practiceAreaId,
        adminHourlyRate: matters.adminHourlyRate,
        attorneyHourlyRate: matters.attorneyHourlyRate,
        paymentFrequency: matters.paymentFrequency,
        status: matters.status,
        deletedAt: matters.deletedAt,
        deletedBy: matters.deletedBy,
        createdAt: matters.createdAt,
        updatedAt: matters.updatedAt,
      })
      .from(matters)
      .innerJoin(matterAssignees, eq(matters.id, matterAssignees.matterId))
      .where(
        and(
          ...conditions,
          eq(matterAssignees.userId, filters.assigneeId),
        ),
      );
  }

  const results = await query
    .orderBy(desc(matters.createdAt))
    .limit(limit)
    .offset(offset);

  // Get total count
  const [countResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(matters)
    .where(and(...conditions));

  return {
    matters: results as SelectMatter[],
    total: Number(countResult.count),
  };
};

// Update matter
export const updateMatter = async (
  id: string,
  data: Partial<InsertMatter>,
): Promise<SelectMatter | undefined> => {
  const [matter] = await db
    .update(matters)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(matters.id, id), isNull(matters.deletedAt)))
    .returning();
  return matter;
};

// Soft delete matter
export const softDeleteMatter = async (
  id: string,
  deletedBy: string,
): Promise<SelectMatter | undefined> => {
  const [matter] = await db
    .update(matters)
    .set({
      deletedAt: new Date(),
      deletedBy,
      updatedAt: new Date(),
    })
    .where(and(eq(matters.id, id), isNull(matters.deletedAt)))
    .returning();
  return matter;
};

// Hard delete matter
export const deleteMatter = async (id: string): Promise<void> => {
  await db.delete(matters).where(eq(matters.id, id));
};

// Get matter counts by status
export const getMatterCountsByStatus = async (
  organizationId: string,
): Promise<{ status: string; count: number }[]> => {
  return await db
    .select({
      status: matters.status,
      count: sql<number>`count(*)`,
    })
    .from(matters)
    .where(and(eq(matters.organizationId, organizationId), isNull(matters.deletedAt)))
    .groupBy(matters.status);
};

// Add assignees to matter
export const addMatterAssignees = async (
  matterId: string,
  userIds: string[],
): Promise<void> => {
  if (userIds.length === 0) return;

  await db.insert(matterAssignees).values(
    userIds.map((userId) => ({
      matterId,
      userId,
    })),
  ).onConflictDoNothing();
};

// Remove assignees from matter
export const removeMatterAssignees = async (
  matterId: string,
  userIds: string[],
): Promise<void> => {
  if (userIds.length === 0) return;

  await db
    .delete(matterAssignees)
    .where(
      and(
        eq(matterAssignees.matterId, matterId),
        inArray(matterAssignees.userId, userIds),
      ),
    );
};

// Get matter assignees
export const getMatterAssignees = async (
  matterId: string,
): Promise<typeof users.$inferSelect[]> => {
  const results = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      image: users.image,
    })
    .from(matterAssignees)
    .innerJoin(users, eq(matterAssignees.userId, users.id))
    .where(eq(matterAssignees.matterId, matterId));

  return results as typeof users.$inferSelect[];
};

// Clear all assignees from matter
export const clearMatterAssignees = async (matterId: string): Promise<void> => {
  await db.delete(matterAssignees).where(eq(matterAssignees.matterId, matterId));
};
