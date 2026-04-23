import { eq, and, like, isNull, inArray, sql, desc } from 'drizzle-orm';
import { matterAssignees } from '@/modules/matters/database/schema/matter-assignees.schema';
import type { SelectMatterMilestone } from '@/modules/matters/database/schema/matter-milestones.schema';
import { matters, type InsertMatter, type SelectMatter } from '@/modules/matters/database/schema/matters.schema';
import type { MatterListFilters } from '@/modules/matters/types/matter-filters.types';
import { users } from '@/schema';
import { db } from '@/shared/database';

// Create matter
const createMatter = async (data: InsertMatter, tx: typeof db = db): Promise<SelectMatter> => {
  const [matter] = await tx.insert(matters).values(data).returning();
  return matter;
};

// Find matter by ID (excluding soft deleted)
const findMatterById = async (id: string, tx?: typeof db): Promise<SelectMatter | undefined> => {
  const client = tx ?? db;
  const [matter] = await client
    .select()
    .from(matters)
    .where(and(eq(matters.id, id), isNull(matters.deleted_at)))
    .limit(1);
  return matter;
};

/**
 * Find matter by ID with relations (optimized)
 */
const findMatterByIdWithRelations = async (id: string, tx?: typeof db): Promise<MatterWithRelations | undefined> => {
  const client = tx ?? db;
  return await client.query.matters.findFirst({
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
const findMatterByIdWithDeleted = async (id: string, tx?: typeof db): Promise<SelectMatter | undefined> => {
  const client = tx ?? db;
  const [matter] = await client.select().from(matters).where(eq(matters.id, id)).limit(1);
  return matter;
};

// Find matter by intake UUID
const findByIntakeUuid = async (intakeUuid: string, tx: typeof db = db): Promise<SelectMatter | undefined> => {
  const [matter] = await tx
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

  if (filters?.search) {
    conditions.push(like(matters.title, `%${filters.search}%`));
  }

  let results: SelectMatter[];

  // Handle assignee filter separately with join
  if (filters?.assigneeId) {
    results = await db
      .select({
        id: matters.id,
        organization_id: matters.organization_id,
        client_id: matters.client_id,
        title: matters.title,
        description: matters.description,
        case_number: matters.case_number,
        matter_type: matters.matter_type,
        billing_type: matters.billing_type,
        total_fixed_price: matters.total_fixed_price,
        contingency_percentage: matters.contingency_percentage,
        settlement_amount: matters.settlement_amount,
        practice_service_id: matters.practice_service_id,
        admin_hourly_rate: matters.admin_hourly_rate,
        attorney_hourly_rate: matters.attorney_hourly_rate,
        payment_frequency: matters.payment_frequency,
        retainer_balance: matters.retainer_balance,
        retainer_low_balance_threshold: matters.retainer_low_balance_threshold,
        last_conflict_check_at: matters.last_conflict_check_at,
        last_conflict_check_result: matters.last_conflict_check_result,
        status: matters.status,
        urgency: matters.urgency,
        responsible_attorney_id: matters.responsible_attorney_id,
        originating_attorney_id: matters.originating_attorney_id,
        court: matters.court,
        judge: matters.judge,
        opposing_party: matters.opposing_party,
        opposing_counsel: matters.opposing_counsel,
        open_date: matters.open_date,
        close_date: matters.close_date,
        deleted_at: matters.deleted_at,
        deleted_by: matters.deleted_by,
        created_at: matters.created_at,
        updated_at: matters.updated_at,
        conversation_id: matters.conversation_id,
        intake_uuid: matters.intake_uuid,
        on_behalf_of: matters.on_behalf_of,
      })
      .from(matters)
      .innerJoin(matterAssignees, eq(matters.id, matterAssignees.matter_id))
      .where(and(...conditions, eq(matterAssignees.user_id, filters.assigneeId)))
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
  if (filters?.assigneeId) {
    [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(matters)
      .innerJoin(matterAssignees, eq(matters.id, matterAssignees.matter_id))
      .where(and(...conditions, eq(matterAssignees.user_id, filters.assigneeId)));
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
  tx?: typeof db
): Promise<SelectMatter | undefined> => {
  const client = tx ?? db;
  const [matter] = await client
    .update(matters)
    .set({ ...data, updated_at: new Date() })
    .where(and(eq(matters.id, id), isNull(matters.deleted_at)))
    .returning();
  return matter;
};

// Soft delete matter
const softDeleteMatter = async (id: string, deletedBy: string, tx?: typeof db): Promise<SelectMatter | undefined> => {
  const client = tx ?? db;
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
const getMatterCountsByStatus = async (organizationId: string): Promise<{ status: string; count: number }[]> =>
  await db
    .select({
      status: matters.status,
      count: sql<number>`count(*)`,
    })
    .from(matters)
    .where(and(eq(matters.organization_id, organizationId), isNull(matters.deleted_at)))
    .groupBy(matters.status);

// Add assignees to matter
const addMatterAssignees = async (matterId: string, userIds: string[], tx?: typeof db): Promise<void> => {
  if (userIds.length === 0) {
    return;
  }

  const client = tx ?? db;
  await client
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
const removeMatterAssignees = async (matterId: string, userIds: string[], tx?: typeof db): Promise<void> => {
  if (userIds.length === 0) {
    return;
  }

  const client = tx ?? db;
  await client
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
  await db
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
const clearMatterAssignees = async (matterId: string, tx?: typeof db): Promise<void> => {
  const client = tx ?? db;
  await client.delete(matterAssignees).where(eq(matterAssignees.matter_id, matterId));
};

/**
 * Update matter retainer balance
 */
const updateRetainerBalance = async (matterId: string, newBalance: number, tx?: typeof db): Promise<void> => {
  const client = tx ?? db;
  await client
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
