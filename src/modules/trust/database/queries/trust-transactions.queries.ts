import {
  eq, and, desc, gte, lte, sql,
} from 'drizzle-orm';
import {
  trustTransactions,
  type InsertTrustTransaction,
  type SelectTrustTransaction,
} from '@/modules/trust/database/schema/trust-transactions.schema';
import { db } from '@/shared/database';

/**
 * Create a trust transaction record.
 */
const createTransaction = async (
  data: InsertTrustTransaction,
  tx?: typeof db,
): Promise<SelectTrustTransaction> => {
  const client = tx || db;
  const [record] = await client
    .insert(trustTransactions)
    .values(data)
    .returning();
  return record;
};

/**
 * Get trust transaction history for a client, optionally filtered by matter.
 */
const listByClient = async (params: {
  organizationId: string;
  clientId: string;
  matterId?: string;
  startDate?: Date;
  endDate?: Date;
}): Promise<SelectTrustTransaction[]> => {
  const conditions = [
    eq(trustTransactions.organization_id, params.organizationId),
    eq(trustTransactions.client_id, params.clientId),
  ];

  if (params.matterId) {
    conditions.push(eq(trustTransactions.matter_id, params.matterId));
  }
  if (params.startDate) {
    conditions.push(gte(trustTransactions.created_at, params.startDate));
  }
  if (params.endDate) {
    conditions.push(lte(trustTransactions.created_at, params.endDate));
  }

  return await db
    .select()
    .from(trustTransactions)
    .where(and(...conditions))
    .orderBy(desc(trustTransactions.created_at));
};

/**
 * Get all trust transactions for an org, optionally filtered by client_id, matter_id.
 */
const listByOrg = async (params: {
  organizationId: string;
  clientId?: string;
  matterId?: string;
  startDate?: Date;
  endDate?: Date;
}): Promise<SelectTrustTransaction[]> => {
  const conditions = [
    eq(trustTransactions.organization_id, params.organizationId),
  ];

  if (params.clientId) {
    conditions.push(eq(trustTransactions.client_id, params.clientId));
  }
  if (params.matterId) {
    conditions.push(eq(trustTransactions.matter_id, params.matterId));
  }
  if (params.startDate) {
    conditions.push(gte(trustTransactions.created_at, params.startDate));
  }
  if (params.endDate) {
    conditions.push(lte(trustTransactions.created_at, params.endDate));
  }

  return await db
    .select()
    .from(trustTransactions)
    .where(and(...conditions))
    .orderBy(desc(trustTransactions.created_at));
};

/**
 * Get the latest balance_after per client (sum across matters or per matter).
 * Returns the most recent trust_transactions row per client.
 */
const getLatestBalanceByClient = async (
  organizationId: string,
  clientId: string,
): Promise<{ matter_id: string | null; balance: number }[]> => {
  const rows = await db
    .select({
      matter_id: trustTransactions.matter_id,
      balance: sql<number>`MAX(${trustTransactions.balance_after})`,
    })
    .from(trustTransactions)
    .where(
      and(
        eq(trustTransactions.organization_id, organizationId),
        eq(trustTransactions.client_id, clientId),
      ),
    )
    .groupBy(trustTransactions.matter_id);

  return rows.map((r) => ({ matter_id: r.matter_id, balance: Number(r.balance) }));
};

export const trustTransactionsRepository = {
  createTransaction,
  listByClient,
  listByOrg,
  getLatestBalanceByClient,
};
