import { eq, desc, and, gte, lte } from 'drizzle-orm';

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
  return updated;
};

const updateStatus = async (
  id: string,
  status: string,
): Promise<SelectPracticeClientIntake> => {
  const [updated] = await db
    .update(practiceClientIntakes)
    .set({ status, updated_at: new Date() })
    .where(eq(practiceClientIntakes.id, id))
    .returning();
  return updated;
};

const listByOrganization = async (
  organizationId: string,
  limit = 100,
  offset = 0,
): Promise<SelectPracticeClientIntake[]> => {
  return await db
    .select()
    .from(practiceClientIntakes)
    .where(eq(practiceClientIntakes.organization_id, organizationId))
    .orderBy(desc(practiceClientIntakes.created_at))
    .limit(limit)
    .offset(offset);
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
  listByOrganization,
  getStats,
};

