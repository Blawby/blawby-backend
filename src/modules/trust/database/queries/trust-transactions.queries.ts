import { eq, and, desc, gte, lte, isNull } from 'drizzle-orm';
import {
  trustTransactions,
  type InsertTrustTransaction,
  type SelectTrustTransaction,
} from '@/modules/trust/database/schema/trust-transactions.schema';
import { db } from '@/shared/database';

/**
 * Create a trust transaction record.
 */
const createTransaction = async (data: InsertTrustTransaction, tx?: typeof db): Promise<SelectTrustTransaction> => {
  const client = tx ?? db;
  const records = await client.insert(trustTransactions).values(data).returning();
  const [record] = records;
  if (!record) {
    throw new Error('Failed to create trust transaction: no row returned');
  }
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
  const conditions = [eq(trustTransactions.organization_id, params.organizationId)];

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
  tx?: typeof db
): Promise<{ matter_id: string | null; balance: number }[]> => {
  const client = tx ?? db;
  const rows = await client
    .selectDistinctOn([trustTransactions.matter_id], {
      matter_id: trustTransactions.matter_id,
      balance: trustTransactions.balance_after,
    })
    .from(trustTransactions)
    .where(and(eq(trustTransactions.organization_id, organizationId), eq(trustTransactions.client_id, clientId)))
    .orderBy(trustTransactions.matter_id, desc(trustTransactions.created_at));

  return rows.map((r) => ({ matter_id: r.matter_id, balance: Number(r.balance) }));
};

/**
 * Get the latest balance_after per client across the entire organization.
 * Returns one row per client with their most recent trust_transactions row.
 */
const getLatestBalancePerClient = async (
  organizationId: string
): Promise<{ client_id: string; balance: number; as_of_date: Date }[]> => {
  const rows = await db
    .selectDistinctOn([trustTransactions.client_id], {
      client_id: trustTransactions.client_id,
      balance: trustTransactions.balance_after,
      as_of_date: trustTransactions.created_at,
    })
    .from(trustTransactions)
    .where(eq(trustTransactions.organization_id, organizationId))
    .orderBy(trustTransactions.client_id, desc(trustTransactions.created_at));

  return rows.map((r) => ({ client_id: r.client_id, balance: Number(r.balance), as_of_date: r.as_of_date }));
};

/**
 * Get the latest balance_after for a specific client/matter and lock the row
 */
const getLatestBalanceForMatter = async (
  organizationId: string,
  clientId: string,
  matterId: string | null,
  tx?: typeof db
): Promise<{ balance: number } | undefined> => {
  if (!tx) {
    throw new Error('Transaction is required for getLatestBalanceForMatter due to row locking (.for update)');
  }
  const client = tx;
  type Condition = ReturnType<typeof eq>;
  const conditions: Condition[] = [
    eq(trustTransactions.organization_id, organizationId),
    eq(trustTransactions.client_id, clientId),
  ];
  if (matterId) {
    conditions.push(eq(trustTransactions.matter_id, matterId));
  } else {
    conditions.push(isNull(trustTransactions.matter_id));
  }
  const [row] = await client
    .select({ balance: trustTransactions.balance_after })
    .from(trustTransactions)
    .where(and(...conditions))
    .orderBy(desc(trustTransactions.created_at))
    .limit(1)
    .for('update');

  return row ? { balance: Number(row.balance) } : undefined;
};

export const trustTransactionsRepository = {
  createTransaction,
  listByClient,
  listByOrg,
  getLatestBalanceByClient,
  getLatestBalancePerClient,
  getLatestBalanceForMatter,
};
