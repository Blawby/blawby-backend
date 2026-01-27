import {
  eq, desc, and, ilike, or, sql, type SQL,
} from 'drizzle-orm';
import { addresses, type Address } from '@/modules/practice/database/schema/addresses.schema';
import {
  userDetailsSchema,
  type InsertUserDetail,
  type SelectUserDetail,
} from '@/modules/user-details/database/schema/user-details.schema';
import { users } from '@/schema/better-auth-schema';
import { db } from '@/shared/database';

const { userDetails } = userDetailsSchema;


const create = async (
  data: InsertUserDetail,
): Promise<SelectUserDetail> => {
  const [client] = await db
    .insert(userDetails)
    .values(data)
    .returning();
  return client;
};

const findById = async (
  id: string,
): Promise<(SelectUserDetail & { user: typeof users.$inferSelect }) | undefined> => {
  return db.query.userDetails.findFirst({
    where: and(eq(userDetails.id, id), sql`${userDetails.deleted_at} IS NULL`),
    with: {
      user: true,
    },
  });
};


const findByOrgAndUser = async (
  organizationId: string,
  userId: string,
): Promise<SelectUserDetail | undefined> => {
  const [result] = await db
    .select()
    .from(userDetails)
    .where(
      and(
        eq(userDetails.organization_id, organizationId),
        eq(userDetails.user_id, userId),
        sql`${userDetails.deleted_at} IS NULL`,
      ),
    )
    .limit(1);
  return result;
};

const findByStripeCustomerId = async (
  stripeCustomerId: string,
): Promise<SelectUserDetail | undefined> => {
  const [result] = await db
    .select()
    .from(userDetails)
    .where(and(eq(userDetails.stripe_customer_id, stripeCustomerId), sql`${userDetails.deleted_at} IS NULL`))
    .limit(1);
  return result;
};

const update = async (
  id: string,
  data: Partial<SelectUserDetail>,
): Promise<SelectUserDetail | undefined> => {
  const [updated] = await db
    .update(userDetails)
    .set({ ...data, updated_at: new Date() })
    .where(eq(userDetails.id, id))
    .returning();
  return updated;
};

const softDelete = async (
  id: string,
  deletedBy: string,
): Promise<SelectUserDetail | undefined> => {
  const [updated] = await db
    .update(userDetails)
    .set({
      deleted_at: new Date(),
      deleted_by: deletedBy,
      updated_at: new Date(),
    })
    .where(eq(userDetails.id, id))
    .returning();
  return updated;
};

const listClients = async (params: {
  organizationId: string;
  search?: string;
  status?: string;
  limit?: number;
  offset?: number;
}): Promise<{
  data: (SelectUserDetail & { user: typeof users.$inferSelect; address: Address | null })[];
  total: number;
}> => {
  const {
    organizationId, search, status, limit = 20, offset = 0,
  } = params;

  const conditions: SQL[] = [
    eq(userDetails.organization_id, organizationId),
    sql`${userDetails.deleted_at} IS NULL`,
  ];

  if (status) {
    conditions.push(eq(userDetails.status, status));
  }

  if (search) {
    const searchPattern = `%${search}%`;
    const searchCondition: SQL = or(
      ilike(users.name, searchPattern),
      ilike(users.email, searchPattern),
      ilike(sql`COALESCE(${users.phone}, '')`, searchPattern),
    )!;
    conditions.push(searchCondition);
  }

  const whereClause = and(...conditions);

  // Use consistent query approach for both count and data
  const [totalResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(userDetails)
    .innerJoin(users, eq(userDetails.user_id, users.id))
    .where(whereClause);

  // Use select-based query with explicit joins to match count query behavior
  const rows = await db
    .select({
      userDetail: userDetails,
      user: users,
      address: addresses,
    })
    .from(userDetails)
    .innerJoin(users, eq(userDetails.user_id, users.id))
    .leftJoin(addresses, eq(userDetails.address_id, addresses.id))
    .where(whereClause)
    .orderBy(desc(userDetails.created_at))
    .limit(limit)
    .offset(offset);

  // Reshape results to match expected return type
  const data = rows.map((row) => ({
    ...row.userDetail,
    user: row.user,
    address: row.address,
  }));

  return {
    data: data as (SelectUserDetail & { user: typeof users.$inferSelect; address: Address | null })[],
    total: Number(totalResult?.count || 0),
  };
};


export const userDetailsRepository = {
  create,
  findById,
  findByOrgAndUser,
  findByStripeCustomerId,
  update,
  softDelete,
  listClients,
};

