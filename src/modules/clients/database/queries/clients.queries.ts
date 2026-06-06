import { eq, desc, and, ilike, or, sql, isNull, type SQL } from 'drizzle-orm';
import { addresses, type Address } from '@/modules/practice/database/schema/addresses.schema';
import { clientsSchema, type InsertClient, type SelectClient } from '@/modules/clients/database/schema/clients.schema';
import { users } from '@/schema/better-auth-schema';
import { getActiveTx } from '@/shared/database/uow';

const { clients } = clientsSchema;

const create = async (data: InsertClient): Promise<SelectClient> => {
  const [client] = await getActiveTx().insert(clients).values(data).returning();
  return client;
};

const findById = async (id: string): Promise<(SelectClient & { user: typeof users.$inferSelect | null }) | undefined> =>
  await getActiveTx().query.clients.findFirst({
    where: and(eq(clients.id, id), sql`${clients.deleted_at} IS NULL`),
    with: {
      user: true,
    },
  });

const findByOrgAndUser = async (organizationId: string, userId: string): Promise<SelectClient | undefined> => {
  const [result] = await getActiveTx()
    .select()
    .from(clients)
    .where(
      and(eq(clients.organization_id, organizationId), eq(clients.user_id, userId), sql`${clients.deleted_at} IS NULL`)
    )
    .limit(1);
  return result;
};

const findByStripeCustomerId = async (stripeCustomerId: string): Promise<SelectClient | undefined> => {
  const [result] = await getActiveTx()
    .select()
    .from(clients)
    .where(and(eq(clients.stripe_customer_id, stripeCustomerId), sql`${clients.deleted_at} IS NULL`))
    .limit(1);
  return result;
};

const update = async (id: string, data: Partial<SelectClient>): Promise<SelectClient | undefined> => {
  const [updated] = await getActiveTx()
    .update(clients)
    .set({ ...data, updated_at: new Date() })
    .where(and(eq(clients.id, id), isNull(clients.deleted_at)))
    .returning();
  return updated;
};

const updateIntakeIfNull = async (id: string, intakeId: string): Promise<SelectClient | undefined> => {
  const [updated] = await getActiveTx()
    .update(clients)
    .set({ intake_id: intakeId, status: 'active', updated_at: new Date() })
    .where(and(eq(clients.id, id), isNull(clients.deleted_at), isNull(clients.intake_id)))
    .returning();
  return updated;
};

const softDelete = async (id: string, deletedBy: string): Promise<SelectClient | undefined> => {
  const [updated] = await getActiveTx()
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
    const phoneCondition = and(sql`${users.phone} IS NOT NULL`, ilike(users.phone, searchPattern));
    const searchCondition: SQL = or(
      ilike(clients.name, searchPattern),
      ilike(clients.email, searchPattern),
      phoneCondition
    )!;
    conditions.push(searchCondition);
  }

  const whereClause = and(...conditions);

  // Use consistent query approach for both count and data
  const [totalResult] = await getActiveTx()
    .select({ count: sql<number>`count(*)` })
    .from(clients)
    .leftJoin(users, eq(clients.user_id, users.id))
    .where(whereClause);

  // Use select-based query with explicit joins to match count query behavior
  const rows = await getActiveTx()
    .select({
      client: clients,
      user: users,
      address: addresses,
    })
    .from(clients)
    .leftJoin(users, eq(clients.user_id, users.id))
    .leftJoin(addresses, eq(clients.address_id, addresses.id))
    .where(whereClause)
    .orderBy(desc(clients.created_at))
    .limit(limit)
    .offset(offset);

  // Reshape results to match expected return type
  const data: (SelectClient & { user: typeof users.$inferSelect | null; address: Address | null })[] = rows.map(
    (row) => ({
      ...row.client,
      user: row.user,
      address: row.address,
    })
  );

  return {
    data,
    total: Number(totalResult?.count || 0),
  };
};

export const clientsRepository = {
  create,
  findById,
  findByOrgAndUser,
  findByStripeCustomerId,
  update,
  updateIntakeIfNull,
  softDelete,
  listClients,
};
