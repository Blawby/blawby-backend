import {
  type InsertRefundRequest,
  type SelectRefundRequest,
  refundRequests,
} from '@/modules/invoices/database/schema/refund-requests.schema';
import type { RefundRequestUpdatePatch } from '@/modules/invoices/types/refund-request';
import { db } from '@/shared/database';
import { getActiveTx } from '@/shared/database/uow';
import { and, desc, eq } from 'drizzle-orm';

const create = async (data: InsertRefundRequest): Promise<SelectRefundRequest> => {
  const [req] = await getActiveTx().insert(refundRequests).values(data).returning();
  return req;
};

const findById = async (id: string, organizationId: string): Promise<SelectRefundRequest | undefined> => {
  const [req] = await db
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
  const [req] = await db
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

const listByOrganization = async (
  organizationId: string,
  filters?: { status?: string; invoice_id?: string; client_user_details_id?: string }
): Promise<SelectRefundRequest[]> =>
  getActiveTx().query.refundRequests.findMany({
    where: (rr, { and: a, eq: e }) =>
      a(
        e(rr.organization_id, organizationId),
        ...(filters?.status ? [e(rr.status, filters.status)] : []),
        ...(filters?.invoice_id ? [e(rr.invoice_id, filters.invoice_id)] : []),
        ...(filters?.client_user_details_id ? [e(rr.client_user_details_id, filters.client_user_details_id)] : [])
      ),
    orderBy: (rr, { desc: d }) => [d(rr.created_at)],
  });

const listByClient = async (organizationId: string, clientUserDetailsId: string): Promise<SelectRefundRequest[]> =>
  db
    .select()
    .from(refundRequests)
    .where(
      and(
        eq(refundRequests.organization_id, organizationId),
        eq(refundRequests.client_user_details_id, clientUserDetailsId)
      )
    )
    .orderBy(desc(refundRequests.created_at));

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
  listByClient,
  update,
  transitionStatus,
  transitionStatusForClient,
};
