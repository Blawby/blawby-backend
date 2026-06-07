import { and, desc, eq, sql } from 'drizzle-orm';
import { payouts, type InsertPayout, type SelectPayout } from '@/modules/payouts/database/schema/payouts.schema';
import { db } from '@/shared/database';
import { getActiveTx } from '@/shared/database/uow';

interface ListPayoutsFilters {
  status?: string;
  page: number;
  limit: number;
}

/**
 * Insert a payout, or update it in place when the Stripe payout already exists.
 * Webhooks for the same payout (created → updated → paid/failed) all funnel here.
 *
 * Returns undefined when the incoming event is older than the stored event
 * (out-of-order delivery); the row is left unchanged in that case.
 */
const upsertByStripePayoutId = async (data: InsertPayout): Promise<SelectPayout | undefined> => {
  const [payout] = await getActiveTx()
    .insert(payouts)
    .values(data)
    .onConflictDoUpdate({
      target: payouts.stripe_payout_id,
      set: {
        amount: data.amount,
        currency: data.currency,
        status: data.status,
        type: data.type,
        method: data.method,
        description: data.description,
        statement_descriptor: data.statement_descriptor,
        failure_code: data.failure_code,
        failure_message: data.failure_message,
        destination_id: data.destination_id,
        balance_transaction_id: data.balance_transaction_id,
        automatic: data.automatic,
        arrival_date: data.arrival_date,
        metadata: data.metadata,
        last_stripe_event_created_at: data.last_stripe_event_created_at,
        last_stripe_event_id: data.last_stripe_event_id,
        updated_at: new Date(),
      },
      // Apply update only when the incoming event is strictly newer than the last
      // persisted event. Same-second events are rejected (can't determine order
      // — Stripe event IDs are not guaranteed time-ordered).
      setWhere: sql`excluded.last_stripe_event_created_at > ${payouts.last_stripe_event_created_at}`,
    })
    .returning();

  return payout;
};

/**
 * List payouts for an organization (the ledger), newest settlement batch first.
 */
const listByOrganization = async (
  organizationId: string,
  filters: ListPayoutsFilters
): Promise<{ payouts: SelectPayout[]; total: number }> => {
  const offset = (filters.page - 1) * filters.limit;

  const conditions = [eq(payouts.organization_id, organizationId)];
  if (filters.status) {
    conditions.push(eq(payouts.status, filters.status));
  }
  const where = and(...conditions);

  const results = await db
    .select()
    .from(payouts)
    .where(where)
    // Tie-break on id so equal timestamps yield a stable, deterministic page order.
    .orderBy(desc(payouts.stripe_created_at), desc(payouts.id))
    .limit(filters.limit)
    .offset(offset);

  const [countResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(payouts)
    .where(where);

  return {
    payouts: results,
    total: Number(countResult?.count ?? 0),
  };
};

const findByIdAndOrganization = async (id: string, organizationId: string): Promise<SelectPayout | undefined> => {
  const [payout] = await db
    .select()
    .from(payouts)
    .where(and(eq(payouts.id, id), eq(payouts.organization_id, organizationId)))
    .limit(1);

  return payout;
};

export const payoutsRepository = {
  upsertByStripePayoutId,
  listByOrganization,
  findByIdAndOrganization,
};
