import {
  eq, desc, and, gte, lte, or, ilike, sql,
} from 'drizzle-orm';

import {
  practiceClientIntakesSchema,
} from '@/modules/practice-client-intakes/database/schema/practice-client-intakes.schema';
import type {
  InsertPracticeClientIntake,
  SelectPracticeClientIntake,
} from '@/modules/practice-client-intakes/database/schema/practice-client-intakes.schema';

import { db } from '@/shared/database';

const { practiceClientIntakes } = practiceClientIntakesSchema;

const create = async (
  data: InsertPracticeClientIntake,
  tx: typeof db = db,
): Promise<SelectPracticeClientIntake> => {
  const [practiceClientIntake] = await tx
    .insert(practiceClientIntakes)
    .values(data)
    .returning();
  return practiceClientIntake;
};

const findById = async (
  id: string,
): Promise<SelectPracticeClientIntake | undefined> => {
  const [result] = await db
    .select()
    .from(practiceClientIntakes)
    .where(eq(practiceClientIntakes.id, id))
    .limit(1);
  return result;
};

const findByStripePaymentLinkId = async (
  linkId: string,
): Promise<SelectPracticeClientIntake | undefined> => {
  const [result] = await db
    .select()
    .from(practiceClientIntakes)
    .where(eq(practiceClientIntakes.stripe_payment_link_id, linkId))
    .limit(1);
  return result;
};

const findByStripePaymentIntentId = async (
  intentId: string,
): Promise<SelectPracticeClientIntake | undefined> => {
  const [result] = await db
    .select()
    .from(practiceClientIntakes)
    .where(eq(practiceClientIntakes.stripe_payment_intent_id, intentId))
    .limit(1);
  return result;
};

const findByStripeCheckoutSessionId = async (
  sessionId: string,
): Promise<SelectPracticeClientIntake | undefined> => {
  const [result] = await db
    .select()
    .from(practiceClientIntakes)
    .where(eq(practiceClientIntakes.stripe_checkout_session_id, sessionId))
    .limit(1);
  return result;
};

const update = async (
  id: string,
  data: Partial<SelectPracticeClientIntake>,
): Promise<SelectPracticeClientIntake> => {
  const [updated] = await db
    .update(practiceClientIntakes)
    .set({ ...data, updated_at: new Date() })
    .where(eq(practiceClientIntakes.id, id))
    .returning();
  if (!updated) {
    throw new Error(`PracticeClientIntake not found for id: ${id}`);
  }
  return updated;
};

const updateStatus = async (
  id: string,
  status: string,
  tx: typeof db = db,
): Promise<SelectPracticeClientIntake> => {
  const [updated] = await tx
    .update(practiceClientIntakes)
    .set({ status, updated_at: new Date() })
    .where(eq(practiceClientIntakes.id, id))
    .returning();
  if (!updated) {
    throw new Error(`PracticeClientIntake not found for id: ${id}`);
  }
  return updated;
};

const findByOrganizationId = async ({
  organizationId,
  status,
  search,
  from,
  to,
  page = 1,
  limit = 20,
}: {
  organizationId: string;
  status?: string;
  search?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}): Promise<{ intakes: SelectPracticeClientIntake[]; total: number }> => {
  const conditions = [eq(practiceClientIntakes.organization_id, organizationId)];

  if (status) {
    conditions.push(eq(practiceClientIntakes.status, status));
  }

  if (search) {
    conditions.push(
      or(
        ilike(sql`${practiceClientIntakes.metadata}->>'email'`, `%${search}%`),
        ilike(sql`${practiceClientIntakes.metadata}->>'name'`, `%${search}%`),
        ilike(sql`${practiceClientIntakes.metadata}->>'opposing_party'`, `%${search}%`),
      )!,
    );
  }

  if (from) {
    conditions.push(gte(practiceClientIntakes.created_at, new Date(from)));
  }

  if (to) {
    conditions.push(lte(practiceClientIntakes.created_at, new Date(to)));
  }

  const whereClause = and(...conditions.filter((c): c is NonNullable<typeof c> => c !== undefined));

  const [totalResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(practiceClientIntakes)
    .where(whereClause);

  const total = Number(totalResult?.count ?? 0);

  const intakes = await db
    .select()
    .from(practiceClientIntakes)
    .where(whereClause)
    .orderBy(desc(practiceClientIntakes.created_at))
    .limit(limit)
    .offset((page - 1) * limit);

  return { intakes, total };
};

const getStats = async (
  organizationId: string,
  startDate?: Date,
  endDate?: Date,
): Promise<{
  totalAmount: number;
  count: number;
  succeededCount: number;
}> => {
  const conditions = [eq(practiceClientIntakes.organization_id, organizationId)];

  if (startDate) {
    conditions.push(gte(practiceClientIntakes.created_at, startDate));
  }

  if (endDate) {
    conditions.push(lte(practiceClientIntakes.created_at, endDate));
  }

  const results = await db
    .select({
      totalAmount: practiceClientIntakes.amount,
      status: practiceClientIntakes.status,
    })
    .from(practiceClientIntakes)
    .where(and(...conditions));

  const totalAmount = results.reduce((sum, row) => sum + row.totalAmount, 0);
  const count = results.length;
  const succeededCount = results.filter((row) => row.status === 'succeeded').length;

  return {
    totalAmount,
    count,
    succeededCount,
  };
};

export const practiceClientIntakesRepository = {
  create,
  findById,
  findByStripePaymentLinkId,
  findByStripePaymentIntentId,
  findByStripeCheckoutSessionId,
  update,
  updateStatus,
  findByOrganizationId,
  getStats,
};

