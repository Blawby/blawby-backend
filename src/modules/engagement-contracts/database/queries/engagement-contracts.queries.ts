import { eq, and, desc, count } from 'drizzle-orm';
import {
  engagementContracts,
  type InsertEngagementContract,
  type SelectEngagementContract,
} from '@/modules/engagement-contracts/database/schema/engagement-contracts.schema';
import type { EngagementContractStatus } from '@/modules/engagement-contracts/types/proposal-data.types';
import { getActiveTx } from '@/shared/database/uow';

const insert = async (data: InsertEngagementContract): Promise<SelectEngagementContract> => {
  const [record] = await getActiveTx().insert(engagementContracts).values(data).returning();
  if (!record) {
    throw new Error('Failed to insert engagement contract');
  }
  return record;
};

const findById = async (id: string): Promise<SelectEngagementContract | undefined> => {
  const [record] = await getActiveTx()
    .select()
    .from(engagementContracts)
    .where(eq(engagementContracts.id, id))
    .limit(1);
  return record;
};

const findByIntakeAndOrg = async (
  intakeId: string,
  organizationId: string
): Promise<SelectEngagementContract | undefined> => {
  const [record] = await getActiveTx()
    .select()
    .from(engagementContracts)
    .where(and(eq(engagementContracts.intake_id, intakeId), eq(engagementContracts.organization_id, organizationId)))
    .limit(1);
  return record;
};

const findAcceptedByIntakeAndOrg = async (
  intakeId: string,
  organizationId: string
): Promise<SelectEngagementContract | undefined> => {
  const [record] = await getActiveTx()
    .select()
    .from(engagementContracts)
    .where(
      and(
        eq(engagementContracts.intake_id, intakeId),
        eq(engagementContracts.organization_id, organizationId),
        eq(engagementContracts.status, 'accepted')
      )
    )
    .limit(1);
  return record;
};

const findByMatterAndOrg = async (
  matterId: string,
  organizationId: string
): Promise<SelectEngagementContract | undefined> => {
  const [record] = await getActiveTx()
    .select()
    .from(engagementContracts)
    .where(and(eq(engagementContracts.matter_id, matterId), eq(engagementContracts.organization_id, organizationId)))
    .limit(1);
  return record;
};

const listByOrg = async (
  organizationId: string,
  filters?: {
    intake_id?: string;
    matter_id?: string;
    status?: EngagementContractStatus;
    limit?: number;
    offset?: number;
  }
): Promise<{ data: SelectEngagementContract[]; total: number }> => {
  const conditions = [eq(engagementContracts.organization_id, organizationId)];

  if (filters?.intake_id) {
    conditions.push(eq(engagementContracts.intake_id, filters.intake_id));
  }

  if (filters?.matter_id) {
    conditions.push(eq(engagementContracts.matter_id, filters.matter_id));
  }

  if (filters?.status) {
    conditions.push(eq(engagementContracts.status, filters.status));
  }

  const [countResult, data] = await Promise.all([
    getActiveTx()
      .select({ total: count() })
      .from(engagementContracts)
      .where(and(...conditions)),
    getActiveTx()
      .select()
      .from(engagementContracts)
      .where(and(...conditions))
      .orderBy(desc(engagementContracts.created_at))
      .limit(filters?.limit ?? 20)
      .offset(filters?.offset ?? 0),
  ]);

  return { data, total: countResult[0]?.total ?? 0 };
};

const update = async (id: string, data: Partial<InsertEngagementContract>): Promise<SelectEngagementContract> => {
  const [record] = await getActiveTx()
    .update(engagementContracts)
    .set(data)
    .where(eq(engagementContracts.id, id))
    .returning();
  if (!record) {
    throw new Error('Failed to update engagement contract');
  }
  return record;
};

export const engagementContractsQueries = {
  insert,
  findById,
  findByIntakeAndOrg,
  findAcceptedByIntakeAndOrg,
  findByMatterAndOrg,
  listByOrg,
  update,
};
