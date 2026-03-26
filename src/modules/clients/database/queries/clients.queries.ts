import { eq, desc, and, ilike, or, sql, type SQL } from 'drizzle-orm';
import { addresses, type Address } from '@/modules/practice/database/schema/addresses.schema';
import { clientsSchema, type InsertClient, type SelectClient } from '@/modules/clients/database/schema/clients.schema';
import { users } from '@/schema/better-auth-schema';
import { db } from '@/shared/database';

type DbOrTx = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

const { clients } = clientsSchema;

const create = async (data: InsertClient): Promise<SelectClient> => {
  const [client] = await db.insert(clients).values(data).returning();
  return client;
};

const findById = async (id: string): Promise<(SelectClient & { user: typeof users.$inferSelect | null }) | undefined> =>
  await db.query.clients.findFirst({
    where: and(eq(clients.id, id), sql`${clients.deleted_at} IS NULL`),
    with: {
      user: true,
    },
  });

const findByOrgAndUser = async (organizationId: string, userId: string): Promise<SelectClient | undefined> => {
  const [result] = await db
    .select()
    .from(clients)
    .where(
      and(eq(clients.organization_id, organizationId), eq(clients.user_id, userId), sql`${clients.deleted_at} IS NULL`)
    )
    .limit(1);
  return result;
};

const findByStripeCustomerId = async (stripeCustomerId: string): Promise<SelectClient | undefined> => {
  const [result] = await db
    .select()
    .from(clients)
    .where(and(eq(clients.stripe_customer_id, stripeCustomerId), sql`${clients.deleted_at} IS NULL`))
    .limit(1);
  return result;
};

const update = async (id: string, data: Partial<SelectClient>, tx: DbOrTx = db): Promise<SelectClient | undefined> => {
  const [updated] = await tx
    .update(clients)
    .set({ ...data, updated_at: new Date() })
    .where(eq(clients.id, id))
    .returning();
  return updated;
};

const softDelete = async (id: string, deletedBy: string): Promise<SelectClient | undefined> => {
  const [updated] = await db
    .update(clients)
    .set({
      deleted_at: new Date(),
      deleted_by: deletedBy,
      updated_at: new Date(),
    })
    .where(eq(clients.id, id))
    .returning();
  return updated;
};

const listClients = async (params: {
  organizationId: string;
  clientId?: string;
  search?: string;
  status?: string;
  limit?: number;
  offset?: number;
}): Promise<{
  data: (SelectClient & { user: typeof users.$inferSelect | null; address: Address | null })[];
  total: number;
}> => {
  const { organizationId, clientId, search, status, limit = 20, offset = 0 } = params;

  const conditions: SQL[] = [eq(clients.organization_id, organizationId), sql`${clients.deleted_at} IS NULL`];

  if (clientId) {
    conditions.push(eq(clients.id, clientId));
  }

  if (status) {
    conditions.push(eq(clients.status, status));
  }

  if (search) {
    const searchPattern = `%${search}%`;
    const searchCondition: SQL = or(
      ilike(clients.name, searchPattern),
      ilike(clients.email, searchPattern),
      ilike(sql`COALESCE(${users.phone}, '')`, searchPattern)
    )!;
    conditions.push(searchCondition);
  }

  const whereClause = and(...conditions);

  // Use consistent query approach for both count and data
  const [totalResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(clients)
    .innerJoin(users, eq(clients.user_id, users.id))
    .where(whereClause);

  // Use select-based query with explicit joins to match count query behavior
  const rows = await db
    .select({
      client: clients,
      user: users,
      address: addresses,
    })
    .from(clients)
    .innerJoin(users, eq(clients.user_id, users.id))
    .leftJoin(addresses, eq(clients.address_id, addresses.id))
    .where(whereClause)
    .orderBy(desc(clients.created_at))
    .limit(limit)
    .offset(offset);

  // Reshape results to match expected return type
  const data = rows.map((row) => ({
    ...row.client,
    user: row.user,
    address: row.address,
  }));

  return {
    data: data as (SelectClient & { user: typeof users.$inferSelect | null; address: Address | null })[],
    total: Number(totalResult?.count || 0),
  };
};

export const clientsRepository = {
  create,
  findById,
  findByOrgAndUser,
  findByStripeCustomerId,
  update,
  softDelete,
  listClients,
};
