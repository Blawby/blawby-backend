import { and, desc, eq, gt } from 'drizzle-orm';
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
  const [row] = await getActiveTx().insert(pendingActions).values(data).returning();
  return row;
};

const findById = async (id: string, organizationId: string): Promise<SelectPendingAction | undefined> => {
  const [row] = await getActiveTx()
    .select()
    .from(pendingActions)
    .where(and(eq(pendingActions.id, id), eq(pendingActions.organization_id, organizationId)))
    .limit(1);
  return row;
};

/** Finds a non-terminal (still dedupe-able) pending action with the same idempotency key. */
const findActiveByIdempotencyKey = async (
  organizationId: string,
  toolName: string,
  idempotencyKey: string
): Promise<SelectPendingAction | undefined> => {
  const [row] = await getActiveTx()
    .select()
    .from(pendingActions)
    .where(
      and(
        eq(pendingActions.organization_id, organizationId),
        eq(pendingActions.tool_name, toolName),
        eq(pendingActions.idempotency_key, idempotencyKey),
        gt(pendingActions.expires_at, new Date())
      )
    )
    .orderBy(desc(pendingActions.created_at))
    .limit(1);
  return row;
};

const listByOrganization = async (
  organizationId: string,
  filters?: { status?: string }
): Promise<SelectPendingAction[]> =>
  getActiveTx().query.pendingActions.findMany({
    where: (pa, { and: a, eq: e }) =>
      a(eq(pa.organization_id, organizationId), ...(filters?.status ? [e(pa.status, filters.status)] : [])),
    orderBy: (pa, { desc: d }) => [d(pa.created_at)],
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
  findActiveByIdempotencyKey,
  listByOrganization,
  transitionStatus,
};
