import {
  eq, desc, and, ilike, or, sql,
} from 'drizzle-orm';
import {
  practiceClientsSchema,
  type InsertPracticeClient,
  type SelectPracticeClient,
} from '@/modules/clients/database/schema/practice-clients.schema';
import { db } from '@/shared/database';

const { practiceClients } = practiceClientsSchema;

const create = async (
  data: InsertPracticeClient,
): Promise<SelectPracticeClient> => {
  const [client] = await db
    .insert(practiceClients)
    .values(data)
    .returning();
  return client;
};

const findById = async (
  id: string,
): Promise<SelectPracticeClient | undefined> => {
  const [result] = await db
    .select()
    .from(practiceClients)
    .where(and(eq(practiceClients.id, id), sql`${practiceClients.deleted_at} IS NULL`))
    .limit(1);
  return result;
};

const findByEmail = async (
  organizationId: string,
  email: string,
): Promise<SelectPracticeClient | undefined> => {
  const [result] = await db
    .select()
    .from(practiceClients)
    .where(
      and(
        eq(practiceClients.organization_id, organizationId),
        eq(practiceClients.email, email),
        sql`${practiceClients.deleted_at} IS NULL`,
      ),
    )
    .limit(1);
  return result;
};

const findByStripeCustomerId = async (
  stripeCustomerId: string,
): Promise<SelectPracticeClient | undefined> => {
  const [result] = await db
    .select()
    .from(practiceClients)
    .where(and(eq(practiceClients.stripe_customer_id, stripeCustomerId), sql`${practiceClients.deleted_at} IS NULL`))
    .limit(1);
  return result;
};

const update = async (
  id: string,
  data: Partial<SelectPracticeClient>,
): Promise<SelectPracticeClient | undefined> => {
  const [updated] = await db
    .update(practiceClients)
    .set({ ...data, updated_at: new Date() })
    .where(eq(practiceClients.id, id))
    .returning();
  return updated;
};

const softDelete = async (
  id: string,
  deletedBy: string,
): Promise<SelectPracticeClient | undefined> => {
  const [updated] = await db
    .update(practiceClients)
    .set({
      deleted_at: new Date(),
      deleted_by: deletedBy,
      updated_at: new Date(),
    })
    .where(eq(practiceClients.id, id))
    .returning();
  return updated;
};

const listClients = async (params: {
  organizationId: string;
  search?: string;
  status?: string;
  limit?: number;
  offset?: number;
}): Promise<{ data: (SelectPracticeClient & { address: any })[]; total: number }> => {
  const {
    organizationId, search, status, limit = 20, offset = 0,
  } = params;

  const conditions = [
    eq(practiceClients.organization_id, organizationId),
    sql`${practiceClients.deleted_at} IS NULL`,
  ];

  if (status) {
    conditions.push(eq(practiceClients.status, status));
  }

  if (search) {
    conditions.push(
      or(
        ilike(practiceClients.name, `%${search}%`),
        ilike(practiceClients.email, `%${search}%`),
        sql`COALESCE(${practiceClients.phone}, '') ILIKE ${`%${search}%`}`,
      ) as any,
    );
  }

  const whereClause = and(...conditions);

  const [totalResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(practiceClients)
    .where(whereClause);

  const data = await db.query.practiceClients.findMany({
    where: whereClause,
    orderBy: desc(practiceClients.created_at),
    limit,
    offset,
    with: {
      address: true,
    },
  });

  return {
    data,
    total: Number(totalResult?.count || 0),
  };
};

export const practiceClientsRepository = {
  create,
  findById,
  findByEmail,
  findByStripeCustomerId,
  update,
  softDelete,
  listClients,
};
