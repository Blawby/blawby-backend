import {
  type InsertRefundRequest,
  type SelectRefundRequest,
  refundRequests,
} from '@/modules/invoices/database/schema/refund-requests.schema';
import type { RefundRequestUpdatePatch } from '@/modules/invoices/types/refund-request';
import { getActiveTx } from '@/shared/database/uow';
import { and, desc, eq, sql } from 'drizzle-orm';

const create = async (data: InsertRefundRequest): Promise<SelectRefundRequest> => {
  const [req] = await getActiveTx().insert(refundRequests).values(data).returning();
  return req;
};

const findById = async (id: string, organizationId: string): Promise<SelectRefundRequest | undefined> => {
  const [req] = await getActiveTx()
    .select()
    .from(refundRequests)
    .where(and(eq(refundRequests.id, id), eq(refundRequests.organization_id, organizationId)))
    .limit(1);
  return req;
};

const findByIdAndClient = async (
  id: string,
  organizationId: string,
  clientUserDetailsId: string
): Promise<SelectRefundRequest | undefined> => {
  const [req] = await getActiveTx()
    .select()
    .from(refundRequests)
    .where(
      and(
        eq(refundRequests.id, id),
        eq(refundRequests.organization_id, organizationId),
        eq(refundRequests.client_user_details_id, clientUserDetailsId)
      )
    )
    .limit(1);
  return req;
};

const organizationListConditions = (
  organizationId: string,
  filters?: { status?: string; invoice_id?: string; client_user_details_id?: string }
) =>
  and(
    eq(refundRequests.organization_id, organizationId),
    ...(filters?.status ? [eq(refundRequests.status, filters.status)] : []),
    ...(filters?.invoice_id ? [eq(refundRequests.invoice_id, filters.invoice_id)] : []),
    ...(filters?.client_user_details_id
      ? [eq(refundRequests.client_user_details_id, filters.client_user_details_id)]
      : [])
  );

// Unpaginated by default so existing internal callers (existence/aggregate checks) keep receiving the full matching set; pass page/limit only from the public list endpoints.
const listByOrganization = async (
  organizationId: string,
  filters?: { status?: string; invoice_id?: string; client_user_details_id?: string; page?: number; limit?: number }
): Promise<SelectRefundRequest[]> => {
  const conditions = organizationListConditions(organizationId, filters);
  const query = getActiveTx().select().from(refundRequests).where(conditions).orderBy(desc(refundRequests.created_at));

  if (filters?.page === undefined && filters?.limit === undefined) {
    return query;
  }
  const limit = filters?.limit ?? 20;
  const offset = ((filters?.page ?? 1) - 1) * limit;
  return query.limit(limit).offset(offset);
};

const countByOrganization = async (
  organizationId: string,
  filters?: { status?: string; invoice_id?: string; client_user_details_id?: string }
): Promise<number> => {
  const [countResult] = await getActiveTx()
    .select({ count: sql<number>`count(*)` })
    .from(refundRequests)
    .where(organizationListConditions(organizationId, filters));
  return countResult?.count ?? 0;
};

const listByClient = async (
  organizationId: string,
  clientUserDetailsId: string,
  pagination?: { page?: number; limit?: number }
): Promise<SelectRefundRequest[]> => {
  const conditions = and(
    eq(refundRequests.organization_id, organizationId),
    eq(refundRequests.client_user_details_id, clientUserDetailsId)
  );
  const query = getActiveTx().select().from(refundRequests).where(conditions).orderBy(desc(refundRequests.created_at));

  if (pagination?.page === undefined && pagination?.limit === undefined) {
    return query;
  }
  const limit = pagination?.limit ?? 20;
  const offset = ((pagination?.page ?? 1) - 1) * limit;
  return query.limit(limit).offset(offset);
};

const countByClient = async (organizationId: string, clientUserDetailsId: string): Promise<number> => {
  const [countResult] = await getActiveTx()
    .select({ count: sql<number>`count(*)` })
    .from(refundRequests)
    .where(
      and(
        eq(refundRequests.organization_id, organizationId),
        eq(refundRequests.client_user_details_id, clientUserDetailsId)
      )
    );
  return countResult?.count ?? 0;
};

const update = async (
  id: string,
  organizationId: string,
  patch: RefundRequestUpdatePatch
): Promise<SelectRefundRequest | undefined> => {
  const [updated] = await getActiveTx()
    .update(refundRequests)
    .set({ ...patch, updated_at: new Date() })
    .where(and(eq(refundRequests.id, id), eq(refundRequests.organization_id, organizationId)))
    .returning();
  return updated;
};

const transitionStatus = async (
  id: string,
  organizationId: string,
  fromStatus: string,
  patch: RefundRequestUpdatePatch
): Promise<SelectRefundRequest | undefined> => {
  const [updated] = await getActiveTx()
    .update(refundRequests)
    .set({ ...patch, updated_at: new Date() })
    .where(
      and(
        eq(refundRequests.id, id),
        eq(refundRequests.organization_id, organizationId),
        eq(refundRequests.status, fromStatus)
      )
    )
    .returning();
  return updated;
};

const transitionStatusForClient = async (
  id: string,
  organizationId: string,
  clientUserDetailsId: string,
  fromStatus: string,
  patch: RefundRequestUpdatePatch
): Promise<SelectRefundRequest | undefined> => {
  const [updated] = await getActiveTx()
    .update(refundRequests)
    .set({ ...patch, updated_at: new Date() })
    .where(
      and(
        eq(refundRequests.id, id),
        eq(refundRequests.organization_id, organizationId),
        eq(refundRequests.client_user_details_id, clientUserDetailsId),
        eq(refundRequests.status, fromStatus)
      )
    )
    .returning();
  return updated;
};

export const refundRequestsQueries = {
  create,
  findById,
  findByIdAndClient,
  listByOrganization,
  countByOrganization,
  listByClient,
  countByClient,
  update,
  transitionStatus,
  transitionStatusForClient,
};
