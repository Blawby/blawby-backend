import { eq, and, like, isNull, inArray, sql, desc } from 'drizzle-orm';
import { db } from '@/shared/database';
import {
  matters,
  type InsertMatter,
  type SelectMatter,
} from '@/modules/matters/database/schema/matters.schema';
import { matterAssignees } from '@/modules/matters/database/schema/matter-assignees.schema';
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
    .where(and(eq(matters.id, id), isNull(matters.deleted_at)))
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
    practice_area_id?: string;
    customer_id?: string;
    assignee_id?: string;
    search?: string;
    page?: number;
    limit?: number;
  },
): Promise<{ matters: SelectMatter[]; total: number }> => {
  const page = filters?.page || 1;
  const limit = filters?.limit || 20;
  const offset = (page - 1) * limit;

  let conditions = [
    eq(matters.organization_id, organizationId),
    isNull(matters.deleted_at),
  ];

  if (filters?.status) {
    conditions.push(eq(matters.status, filters.status));
  }

  if (filters?.practice_area_id) {
    conditions.push(eq(matters.practice_area_id, filters.practice_area_id));
  }

  if (filters?.customer_id) {
    conditions.push(eq(matters.customer_id, filters.customer_id));
  }

  if (filters?.search) {
    conditions.push(
      like(matters.title, `%${filters.search}%`),
    );
  }

  let results: SelectMatter[];

  // Handle assignee filter separately with join
  if (filters?.assignee_id) {
    results = await db
      .select({
        id: matters.id,
        organization_id: matters.organization_id,
        customer_id: matters.customer_id,
        practice_client_id: matters.practice_client_id, // Added
        title: matters.title,
        description: matters.description,
        billing_type: matters.billing_type,
        total_fixed_price: matters.total_fixed_price,
        contingency_percentage: matters.contingency_percentage,
        settlement_amount: matters.settlement_amount,
        practice_area_id: matters.practice_area_id,
        admin_hourly_rate: matters.admin_hourly_rate,
        attorney_hourly_rate: matters.attorney_hourly_rate,
        payment_frequency: matters.payment_frequency,
        status: matters.status,
        deleted_at: matters.deleted_at,
        deleted_by: matters.deleted_by,
        created_at: matters.created_at,
        updated_at: matters.updated_at,
      })
      .from(matters)
      .innerJoin(matterAssignees, eq(matters.id, matterAssignees.matter_id))
      .where(
        and(
          ...conditions,
          eq(matterAssignees.user_id, filters.assignee_id),
        ),
      )
      .orderBy(desc(matters.created_at))
      .limit(limit)
      .offset(offset);
  } else {
    results = await db
      .select()
      .from(matters)
      .where(and(...conditions))
      .orderBy(desc(matters.created_at))
      .limit(limit)
      .offset(offset);
  }

  // Get total count
  const [countResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(matters)
    .where(and(...conditions));

  return {
    matters: results,
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
    .set({ ...data, updated_at: new Date() })
    .where(and(eq(matters.id, id), isNull(matters.deleted_at)))
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
      deleted_at: new Date(),
      deleted_by: deletedBy,
      updated_at: new Date(),
    })
    .where(and(eq(matters.id, id), isNull(matters.deleted_at)))
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
    .where(and(eq(matters.organization_id, organizationId), isNull(matters.deleted_at)))
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
      matter_id: matterId,
      user_id: userId,
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
        eq(matterAssignees.matter_id, matterId),
        inArray(matterAssignees.user_id, userIds),
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
    .innerJoin(users, eq(matterAssignees.user_id, users.id))
    .where(eq(matterAssignees.matter_id, matterId));

  return results as typeof users.$inferSelect[];
};

// Clear all assignees from matter
export const clearMatterAssignees = async (matterId: string): Promise<void> => {
  await db.delete(matterAssignees).where(eq(matterAssignees.matter_id, matterId));
};
