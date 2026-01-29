import {
  eq, and, like, isNull, inArray, sql, desc,
} from 'drizzle-orm';
import { matterAssignees } from '@/modules/matters/database/schema/matter-assignees.schema';
import {
  matters,
  type InsertMatter,
  type SelectMatter,
} from '@/modules/matters/database/schema/matters.schema';
import { users } from '@/schema';
import { db } from '@/shared/database';

// Create matter
const createMatter = async (
  data: InsertMatter,
): Promise<SelectMatter> => {
  const [matter] = await db
    .insert(matters)
    .values(data)
    .returning();
  return matter;
};

// Find matter by ID (excluding soft deleted)
const findMatterById = async (
  id: string,
): Promise<SelectMatter | undefined> => {
  const [matter] = await db
    .select()
    .from(matters)
    .where(and(eq(matters.id, id), isNull(matters.deleted_at)))
    .limit(1);
  return matter;
};

/**
 * Find matter by ID with relations (optimized)
 */
const findMatterByIdWithRelations = async (id: string) => {
  return await db.query.matters.findFirst({
    where: and(eq(matters.id, id), isNull(matters.deleted_at)),
    with: {
      assignees: {
        with: {
          user: {
            columns: {
              id: true,
              name: true,
              email: true,
              image: true,
            },
          },
        },
      },
      milestones: {
        orderBy: (milestones, { asc }) => [asc(milestones.order)],
      },
      client: true,
    },
  });
};

// Find matter by ID (including soft deleted)
const findMatterByIdWithDeleted = async (
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
const listMattersByOrganization = async (
  organizationId: string,
  filters?: {
    status?: string;
    practice_service_id?: string;
    client_id?: string;

    assignee_id?: string;
    search?: string;
    page?: number;
    limit?: number;
  },
): Promise<{ matters: SelectMatter[]; total: number }> => {
  const page = filters?.page || 1;
  const limit = filters?.limit || 20;
  const offset = (page - 1) * limit;

  const conditions = [
    eq(matters.organization_id, organizationId),
    isNull(matters.deleted_at),
  ];

  if (filters?.status) {
    conditions.push(eq(matters.status, filters.status));
  }

  if (filters?.practice_service_id) {
    conditions.push(eq(matters.practice_service_id, filters.practice_service_id));
  }

  if (filters?.client_id) {
    conditions.push(eq(matters.client_id, filters.client_id));
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
        client_id: matters.client_id,

        title: matters.title,
        description: matters.description,
        billing_type: matters.billing_type,
        total_fixed_price: matters.total_fixed_price,
        contingency_percentage: matters.contingency_percentage,
        settlement_amount: matters.settlement_amount,
        practice_service_id: matters.practice_service_id,
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

  // Get total count (must include assignee join if filtering by assignee)
  let countResult: { count: number };
  if (filters?.assignee_id) {
    [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(matters)
      .innerJoin(matterAssignees, eq(matters.id, matterAssignees.matter_id))
      .where(
        and(
          ...conditions,
          eq(matterAssignees.user_id, filters.assignee_id),
        ),
      );
  } else {
    [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(matters)
      .where(and(...conditions));
  }

  return {
    matters: results,
    total: Number(countResult.count),
  };
};

// Update matter
const updateMatter = async (
  id: string,
  data: Partial<InsertMatter>,
  tx?: typeof db,
): Promise<SelectMatter | undefined> => {
  const client = tx || db;
  const [matter] = await client
    .update(matters)
    .set({ ...data, updated_at: new Date() })
    .where(and(eq(matters.id, id), isNull(matters.deleted_at)))
    .returning();
  return matter;
};

// Soft delete matter
const softDeleteMatter = async (
  id: string,
  deletedBy: string,
  tx?: typeof db,
): Promise<SelectMatter | undefined> => {
  const client = tx || db;
  const [matter] = await client
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
const deleteMatter = async (id: string): Promise<void> => {
  await db.delete(matters).where(eq(matters.id, id));
};

// Get matter counts by status
const getMatterCountsByStatus = async (
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
const addMatterAssignees = async (
  matterId: string,
  userIds: string[],
  tx?: typeof db,
): Promise<void> => {
  if (userIds.length === 0) return;

  const client = tx || db;
  await client.insert(matterAssignees).values(
    userIds.map((userId) => ({
      matter_id: matterId,
      user_id: userId,
    })),
  ).onConflictDoNothing();
};

// Remove assignees from matter
const removeMatterAssignees = async (
  matterId: string,
  userIds: string[],
  tx?: typeof db,
): Promise<void> => {
  if (userIds.length === 0) return;

  const client = tx || db;
  await client
    .delete(matterAssignees)
    .where(
      and(
        eq(matterAssignees.matter_id, matterId),
        inArray(matterAssignees.user_id, userIds),
      ),
    );
};

// Get matter assignees
type MatterAssignee = {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
};

const getMatterAssignees = async (
  matterId: string,
): Promise<MatterAssignee[]> => {
  return await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      image: users.image,
    })
    .from(matterAssignees)
    .innerJoin(users, eq(matterAssignees.user_id, users.id))
    .where(eq(matterAssignees.matter_id, matterId));
};

// Clear all assignees from matter
const clearMatterAssignees = async (
  matterId: string,
  tx?: typeof db,
): Promise<void> => {
  const client = tx || db;
  await client.delete(matterAssignees).where(eq(matterAssignees.matter_id, matterId));
};

export const mattersQueries = {
  createMatter,
  findMatterById,
  updateMatter,
  softDeleteMatter,
  deleteMatter,
  getMatterCountsByStatus,
  findMatterByIdWithRelations,
  findMatterByIdWithDeleted,
  listMattersByOrganization,
  addMatterAssignees,
  removeMatterAssignees,
  getMatterAssignees,
  clearMatterAssignees,
};
