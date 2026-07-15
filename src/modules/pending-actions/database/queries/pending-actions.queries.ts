import { and, desc, eq, inArray, lte } from 'drizzle-orm';
import {
  type InsertPendingAction,
  type SelectPendingAction,
  pendingActions,
} from '@/modules/pending-actions/database/schema/pending-actions.schema';
import { getActiveTx } from '@/shared/database/uow';

type PendingActionPatch = Partial<
  Pick<
    InsertPendingAction,
    | 'status'
    | 'reviewed_by_user_id'
    | 'reviewed_at'
    | 'review_notes'
    | 'executed_at'
    | 'execution_result'
    | 'execution_error'
  >
>;

const create = async (data: InsertPendingAction): Promise<SelectPendingAction> => {
  const db = getActiveTx();
  const now = new Date();

  await db
    .update(pendingActions)
    .set({ status: 'expired', updated_at: now })
    .where(
      and(
        eq(pendingActions.organization_id, data.organization_id),
        eq(pendingActions.tool_name, data.tool_name),
        eq(pendingActions.idempotency_key, data.idempotency_key),
        eq(pendingActions.status, 'pending'),
        lte(pendingActions.expires_at, now)
      )
    );

  const [created] = await db.insert(pendingActions).values(data).onConflictDoNothing().returning();
  if (created) {
    return created;
  }

  const [existing] = await db
    .select()
    .from(pendingActions)
    .where(
      and(
        eq(pendingActions.organization_id, data.organization_id),
        eq(pendingActions.tool_name, data.tool_name),
        eq(pendingActions.idempotency_key, data.idempotency_key),
        inArray(pendingActions.status, ['pending', 'executing'])
      )
    )
    .orderBy(desc(pendingActions.created_at))
    .limit(1);

  if (!existing) {
    throw new Error('Pending action idempotency conflict did not return the existing action');
  }

  return existing;
};

const findById = async (id: string, organizationId: string): Promise<SelectPendingAction | undefined> => {
  const [row] = await getActiveTx()
    .select()
    .from(pendingActions)
    .where(and(eq(pendingActions.id, id), eq(pendingActions.organization_id, organizationId)))
    .limit(1);
  return row;
};

const listByOrganization = async (
  organizationId: string,
  filters: { status?: string; limit: number; offset: number }
): Promise<SelectPendingAction[]> =>
  getActiveTx().query.pendingActions.findMany({
    where: (pa, { and: a, eq: e }) =>
      a(e(pa.organization_id, organizationId), ...(filters?.status ? [e(pa.status, filters.status)] : [])),
    orderBy: (pa, { desc: d }) => [d(pa.created_at)],
    limit: filters.limit,
    offset: filters.offset,
  });

/** Atomic compare-and-swap status transition — only succeeds if the row is still in `fromStatus`. */
const transitionStatus = async (
  id: string,
  organizationId: string,
  fromStatus: string,
  patch: PendingActionPatch
): Promise<SelectPendingAction | undefined> => {
  const [updated] = await getActiveTx()
    .update(pendingActions)
    .set({ ...patch, updated_at: new Date() })
    .where(
      and(
        eq(pendingActions.id, id),
        eq(pendingActions.organization_id, organizationId),
        eq(pendingActions.status, fromStatus)
      )
    )
    .returning();
  return updated;
};

export const pendingActionsQueries = {
  create,
  findById,
  listByOrganization,
  transitionStatus,
};
