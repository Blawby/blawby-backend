import { eq, desc, and, gte, lte, or, ilike, sql } from 'drizzle-orm';
import {
  practiceClientIntakesSchema,
  type InsertPracticeClientIntake,
  type SelectPracticeClientIntake,
} from '@/modules/practice-client-intakes/database/schema/practice-client-intakes.schema';
import { getActiveTx } from '@/shared/database/uow';
import { escapeLikeWildcards } from '@/shared/utils/database';

const { practiceClientIntakes } = practiceClientIntakesSchema;

const buildIntakeConditions = ({
  organizationId,
  status,
  search,
  from,
  to,
}: {
  organizationId: string;
  status?: string;
  search?: string;
  from?: Date;
  to?: Date;
}) => {
  const triageStatuses = ['pending_review', 'accepted', 'declined'];
  const conditions = [eq(practiceClientIntakes.organization_id, organizationId)];

  if (status) {
    if (triageStatuses.includes(status)) {
      conditions.push(eq(practiceClientIntakes.triage_status, status));
    } else {
      conditions.push(eq(practiceClientIntakes.status, status));
    }
  }

  if (search) {
    const escapedSearch = escapeLikeWildcards(search);
    conditions.push(
      or(
        ilike(sql`${practiceClientIntakes.metadata}->>'email'`, `%${escapedSearch}%`),
        ilike(sql`${practiceClientIntakes.metadata}->>'name'`, `%${escapedSearch}%`),
        ilike(sql`${practiceClientIntakes.metadata}->>'opposing_party'`, `%${escapedSearch}%`)
      )!
    );
  }

  if (from) {
    conditions.push(gte(practiceClientIntakes.created_at, from));
  }

  if (to) {
    conditions.push(lte(practiceClientIntakes.created_at, to));
  }

  return and(...conditions.filter((c): c is NonNullable<typeof c> => c !== undefined));
};

const create = async (data: InsertPracticeClientIntake): Promise<SelectPracticeClientIntake> => {
  const [row] = await getActiveTx().insert(practiceClientIntakes).values(data).returning();
  return row;
};

const findById = async (id: string): Promise<SelectPracticeClientIntake | undefined> => {
  const [row] = await getActiveTx()
    .select()
    .from(practiceClientIntakes)
    .where(eq(practiceClientIntakes.id, id))
    .limit(1);
  return row;
};

const findByStripePaymentLinkId = async (linkId: string): Promise<SelectPracticeClientIntake | undefined> => {
  const [row] = await getActiveTx()
    .select()
    .from(practiceClientIntakes)
    .where(eq(practiceClientIntakes.stripe_payment_link_id, linkId))
    .limit(1);
  return row;
};

const findByStripePaymentIntentId = async (intentId: string): Promise<SelectPracticeClientIntake | undefined> => {
  const [row] = await getActiveTx()
    .select()
    .from(practiceClientIntakes)
    .where(eq(practiceClientIntakes.stripe_payment_intent_id, intentId))
    .limit(1);
  return row;
};

const findByStripeCheckoutSessionId = async (sessionId: string): Promise<SelectPracticeClientIntake | undefined> => {
  const [row] = await getActiveTx()
    .select()
    .from(practiceClientIntakes)
    .where(eq(practiceClientIntakes.stripe_checkout_session_id, sessionId))
    .limit(1);
  return row;
};

const update = async (id: string, data: Partial<SelectPracticeClientIntake>): Promise<SelectPracticeClientIntake> => {
  const [updated] = await getActiveTx()
    .update(practiceClientIntakes)
    .set({ ...data, updated_at: new Date() })
    .where(eq(practiceClientIntakes.id, id))
    .returning();
  if (!updated) throw new Error(`PracticeClientIntake not found for id: ${id}`);
  return updated;
};

const updateStatus = async (id: string, status: string): Promise<SelectPracticeClientIntake> => {
  const [updated] = await getActiveTx()
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
  from?: Date;
  to?: Date;
  page?: number;
  limit?: number;
}): Promise<{ intakes: SelectPracticeClientIntake[]; total: number }> => {
  const whereClause = buildIntakeConditions({ organizationId, status, search, from, to });

  const [totalResult] = await getActiveTx()
    .select({ count: sql<number>`count(*)` })
    .from(practiceClientIntakes)
    .where(whereClause);

  const total = Number(totalResult?.count ?? 0);

  const intakes = await getActiveTx()
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
  endDate?: Date
): Promise<{ totalAmount: number; count: number; succeededCount: number }> => {
  const whereClause = buildIntakeConditions({ organizationId, from: startDate, to: endDate });

  const results = await getActiveTx()
    .select({ totalAmount: practiceClientIntakes.amount, status: practiceClientIntakes.status })
    .from(practiceClientIntakes)
    .where(whereClause);

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

export type PracticeClientIntakesRepository = typeof practiceClientIntakesRepository;
