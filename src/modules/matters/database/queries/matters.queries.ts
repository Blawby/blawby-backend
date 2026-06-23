import { eq, and, like, isNull, inArray, sql, desc, getTableColumns } from 'drizzle-orm';
import { matterAssignees } from '@/modules/matters/database/schema/matter-assignees.schema';
import type { SelectMatterMilestone } from '@/modules/matters/database/schema/matter-milestones.schema';
import { matters, type InsertMatter, type SelectMatter } from '@/modules/matters/database/schema/matters.schema';
import type { MatterListFilters } from '@/modules/matters/types/matter-filters.types';
import { users } from '@/schema';
import { getActiveTx } from '@/shared/database/uow';

// Create matter
const createMatter = async (data: InsertMatter): Promise<SelectMatter> => {
  const [matter] = await getActiveTx().insert(matters).values(data).returning();
  return matter;
};

// Find matter by ID (excluding soft deleted)
const findMatterById = async (id: string): Promise<SelectMatter | undefined> => {
  const [matter] = await getActiveTx()
    .select()
    .from(matters)
    .where(and(eq(matters.id, id), isNull(matters.deleted_at)))
    .limit(1);
  return matter;
};

/**
 * Find matter by ID with relations (optimized)
 */
const findMatterByIdWithRelations = async (id: string): Promise<MatterWithRelations | undefined> => {
  return await getActiveTx().query.matters.findFirst({
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
      client: {
        columns: { id: true, name: true, email: true },
        with: {
          user: {
            columns: { name: true, email: true },
          },
        },
      },
    },
  });
};

// Find matter by ID (including soft deleted)
const findMatterByIdWithDeleted = async (id: string): Promise<SelectMatter | undefined> => {
  const [matter] = await getActiveTx().select().from(matters).where(eq(matters.id, id)).limit(1);
  return matter;
};

// Find matter by intake UUID
const findByIntakeUuid = async (intakeUuid: string): Promise<SelectMatter | undefined> => {
  const [matter] = await getActiveTx()
    .select()
    .from(matters)
    .where(and(eq(matters.intake_uuid, intakeUuid), isNull(matters.deleted_at)))
    .limit(1);
  return matter;
};

// List matters by organization with filters
const listMattersByOrganization = async (
  organizationId: string,
  filters?: MatterListFilters
): Promise<{ matters: SelectMatter[]; total: number }> => {
  const page = filters?.page ?? 1;
  const limit = filters?.limit ?? 20;
  const offset = (page - 1) * limit;

  const conditions = [eq(matters.organization_id, organizationId), isNull(matters.deleted_at)];

  if (filters?.status) {
    conditions.push(eq(matters.status, filters.status));
  }

  if (filters?.practiceServiceId) {
    conditions.push(eq(matters.practice_service_id, filters.practiceServiceId));
  }

  if (filters?.clientId) {
    conditions.push(eq(matters.client_id, filters.clientId));
  }

  if (filters?.matterId) {
    conditions.push(eq(matters.id, filters.matterId));
  }

  if (filters?.responsibleAttorneyId) {
    conditions.push(eq(matters.responsible_attorney_id, filters.responsibleAttorneyId));
  }

  if (filters?.originatingAttorneyId) {
    conditions.push(eq(matters.originating_attorney_id, filters.originatingAttorneyId));
  }

  if (filters?.search) {
    conditions.push(like(matters.title, `%${filters.search}%`));
  }

  let results: SelectMatter[];

  // Handle assignee filter separately with join
  if (filters?.assigneeId) {
    results = await getActiveTx()
      .select(getTableColumns(matters))
      .from(matters)
      .innerJoin(matterAssignees, eq(matters.id, matterAssignees.matter_id))
      .where(and(...conditions, eq(matterAssignees.user_id, filters.assigneeId)))
      .orderBy(desc(matters.created_at))
      .limit(limit)
      .offset(offset);
  } else {
    results = await getActiveTx()
      .select()
      .from(matters)
      .where(and(...conditions))
      .orderBy(desc(matters.created_at))
      .limit(limit)
      .offset(offset);
  }

  // Get total count (must include assignee join if filtering by assignee)
  let countResult: { count: number };
  if (filters?.assigneeId) {
    [countResult] = await getActiveTx()
      .select({ count: sql<number>`count(*)` })
      .from(matters)
      .innerJoin(matterAssignees, eq(matters.id, matterAssignees.matter_id))
      .where(and(...conditions, eq(matterAssignees.user_id, filters.assigneeId)));
  } else {
    [countResult] = await getActiveTx()
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
const updateMatter = async (id: string, data: Partial<InsertMatter>): Promise<SelectMatter | undefined> => {
  const [matter] = await getActiveTx()
    .update(matters)
    .set({ ...data, updated_at: new Date() })
    .where(and(eq(matters.id, id), isNull(matters.deleted_at)))
    .returning();
  return matter;
};

// Soft delete matter
const softDeleteMatter = async (id: string, deletedBy: string): Promise<SelectMatter | undefined> => {
  const [matter] = await getActiveTx()
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
  await getActiveTx().delete(matters).where(eq(matters.id, id));
};

// Get matter counts by status
const getMatterCountsByStatus = async (organizationId: string): Promise<{ status: string; count: number }[]> =>
  await getActiveTx()
    .select({
      status: matters.status,
      count: sql<number>`count(*)`,
    })
    .from(matters)
    .where(and(eq(matters.organization_id, organizationId), isNull(matters.deleted_at)))
    .groupBy(matters.status);

// Get matters summary grouped by originating attorney
const getMattersSummaryByOriginatingAttorney = async (
  organizationId: string
): Promise<
  {
    originating_attorney_id: string | null;
    total_matters: number;
    active_matters: number;
    closed_matters: number;
  }[]
> => {
  const rows = await getActiveTx()
    .select({
      originating_attorney_id: matters.originating_attorney_id,
      total_matters: sql<number>`count(*)::int`,
      active_matters: sql<number>`count(*) FILTER (WHERE ${matters.status} <> 'closed')::int`,
      closed_matters: sql<number>`count(*) FILTER (WHERE ${matters.status} = 'closed')::int`,
    })
    .from(matters)
    .where(and(eq(matters.organization_id, organizationId), isNull(matters.deleted_at)))
    .groupBy(matters.originating_attorney_id);

  return rows.map((r) => ({
    originating_attorney_id: r.originating_attorney_id,
    total_matters: Number(r.total_matters),
    active_matters: Number(r.active_matters),
    closed_matters: Number(r.closed_matters),
  }));
};

// Add assignees to matter
const addMatterAssignees = async (matterId: string, userIds: string[]): Promise<void> => {
  if (userIds.length === 0) {
    return;
  }

  await getActiveTx()
    .insert(matterAssignees)
    .values(
      userIds.map((userId) => ({
        matter_id: matterId,
        user_id: userId,
      }))
    )
    .onConflictDoNothing();
};

// Remove assignees from matter
const removeMatterAssignees = async (matterId: string, userIds: string[]): Promise<void> => {
  if (userIds.length === 0) {
    return;
  }

  await getActiveTx()
    .delete(matterAssignees)
    .where(and(eq(matterAssignees.matter_id, matterId), inArray(matterAssignees.user_id, userIds)));
};

// Get matter assignees
interface MatterAssignee {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
}

const getMatterAssignees = async (matterId: string): Promise<MatterAssignee[]> =>
  await getActiveTx()
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      image: users.image,
    })
    .from(matterAssignees)
    .innerJoin(users, eq(matterAssignees.user_id, users.id))
    .where(eq(matterAssignees.matter_id, matterId));

// Clear all assignees from matter
const clearMatterAssignees = async (matterId: string): Promise<void> => {
  await getActiveTx().delete(matterAssignees).where(eq(matterAssignees.matter_id, matterId));
};

/**
 * Update matter retainer balance
 */
const updateRetainerBalance = async (matterId: string, newBalance: number): Promise<void> => {
  await getActiveTx()
    .update(matters)
    .set({
      retainer_balance: newBalance,
      updated_at: new Date(),
    })
    .where(eq(matters.id, matterId));
};

export const mattersQueries = {
  createMatter,
  findMatterById,
  updateMatter,
  softDeleteMatter,
  deleteMatter,
  getMatterCountsByStatus,
  getMattersSummaryByOriginatingAttorney,
  findMatterByIdWithRelations,
  findMatterByIdWithDeleted,
  listMattersByOrganization,
  addMatterAssignees,
  removeMatterAssignees,
  getMatterAssignees,
  clearMatterAssignees,
  updateRetainerBalance,
  findByIntakeUuid,
};
export type MatterWithRelations = SelectMatter & {
  assignees: Array<{
    user: {
      id: string;
      name: string | null;
      email: string;
      image: string | null;
    };
  }>;
  milestones: SelectMatterMilestone[];
  client: {
    id: string;
    name: string | null;
    email: string | null;
    user: {
      name: string | null;
      email: string;
    } | null;
  } | null;
};
