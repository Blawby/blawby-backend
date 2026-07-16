import {
  trustReconciliations,
  type InsertTrustReconciliation,
  type SelectTrustReconciliation,
} from '@/modules/trust/database/schema/trust-reconciliations.schema';
import { getActiveTx } from '@/shared/database/uow';
import { and, desc, eq } from 'drizzle-orm';

const findByIdempotencyKey = async (
  organizationId: string,
  idempotencyKey: string
): Promise<SelectTrustReconciliation | undefined> => {
  const [row] = await getActiveTx()
    .select()
    .from(trustReconciliations)
    .where(
      and(
        eq(trustReconciliations.organization_id, organizationId),
        eq(trustReconciliations.idempotency_key, idempotencyKey)
      )
    )
    .limit(1);
  return row;
};

const createIdempotent = async (data: InsertTrustReconciliation): Promise<SelectTrustReconciliation> => {
  const [created] = await getActiveTx()
    .insert(trustReconciliations)
    .values(data)
    .onConflictDoNothing({
      target: [trustReconciliations.organization_id, trustReconciliations.idempotency_key],
    })
    .returning();
  if (created) {
    return created;
  }

  const existing = await findByIdempotencyKey(data.organization_id, data.idempotency_key);
  if (!existing) {
    throw new Error('Trust reconciliation idempotency conflict did not return an existing record');
  }
  return existing;
};

const listByOrganization = async (organizationId: string, limit: number): Promise<SelectTrustReconciliation[]> =>
  getActiveTx()
    .select()
    .from(trustReconciliations)
    .where(eq(trustReconciliations.organization_id, organizationId))
    .orderBy(desc(trustReconciliations.created_at))
    .limit(limit);

const getLatest = async (organizationId: string): Promise<SelectTrustReconciliation | undefined> => {
  const [row] = await listByOrganization(organizationId, 1);
  return row;
};

export const trustReconciliationsRepository = {
  findByIdempotencyKey,
  createIdempotent,
  listByOrganization,
  getLatest,
};
