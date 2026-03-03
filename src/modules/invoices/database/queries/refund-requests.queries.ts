import { eq, and, desc } from 'drizzle-orm';
import { refundRequests } from '@/modules/invoices/database/schema/refund-requests.schema';
import type {
  InsertRefundRequest,
  SelectRefundRequest,
} from '@/modules/invoices/database/schema/refund-requests.schema';
import { db } from '@/shared/database';

/**
 * Create a new refund request
 */
const create = async (data: InsertRefundRequest): Promise<SelectRefundRequest> => {
  const [req] = await db.insert(refundRequests).values(data).returning();
  return req;
};

/**
 * Find a single refund request by ID and organization
 */
const findById = async (
  id: string,
  organizationId: string,
): Promise<SelectRefundRequest | undefined> => {
  const [req] = await db
    .select()
    .from(refundRequests)
    .where(and(eq(refundRequests.id, id), eq(refundRequests.organization_id, organizationId)))
    .limit(1);
  return req;
};

/**
 * Find a refund request by ID, org, and client (for client-facing cancellation)
 */
const findByIdAndClient = async (
  id: string,
  organizationId: string,
  clientUserDetailsId: string,
): Promise<SelectRefundRequest | undefined> => {
  const [req] = await db
    .select()
    .from(refundRequests)
    .where(
      and(
        eq(refundRequests.id, id),
        eq(refundRequests.organization_id, organizationId),
        eq(refundRequests.client_user_details_id, clientUserDetailsId),
      ),
    )
    .limit(1);
  return req;
};

/**
 * List all refund requests for an organization (practice-side)
 */
const listByOrganization = async (
  organizationId: string,
  filters?: { status?: string; invoice_id?: string },
): Promise<SelectRefundRequest[]> => {
  return db.query.refundRequests.findMany({
    where: (rr, { and: a, eq: e }) =>
      a(
        e(rr.organization_id, organizationId),
        ...(filters?.status ? [e(rr.status, filters.status)] : []),
        ...(filters?.invoice_id ? [e(rr.invoice_id, filters.invoice_id)] : []),
      ),
    orderBy: (rr, { desc: d }) => [d(rr.created_at)],
  });
};

/**
 * List refund requests for a specific client (client-side)
 */
const listByClient = async (
  organizationId: string,
  clientUserDetailsId: string,
): Promise<SelectRefundRequest[]> => {
  return db
    .select()
    .from(refundRequests)
    .where(
      and(
        eq(refundRequests.organization_id, organizationId),
        eq(refundRequests.client_user_details_id, clientUserDetailsId),
      ),
    )
    .orderBy(desc(refundRequests.created_at));
};

/**
 * Update a refund request
 */
const update = async (
  id: string,
  organizationId: string,
  data: Partial<InsertRefundRequest>,
): Promise<SelectRefundRequest | undefined> => {
  const [updated] = await db
    .update(refundRequests)
    .set({ ...data, updated_at: new Date() })
    .where(and(eq(refundRequests.id, id), eq(refundRequests.organization_id, organizationId)))
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
};
