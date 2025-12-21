import { eq, desc, and, gte, lte } from 'drizzle-orm';

import {
  practiceClientIntakes,
  type InsertPracticeClientIntake,
  type SelectPracticeClientIntake,
} from '@/modules/practice-client-intakes/database/schema/practice-client-intakes.schema';

import { db } from '@/shared/database';

export const practiceClientIntakesRepository = {
  create: async function create(
    data: InsertPracticeClientIntake,
  ): Promise<SelectPracticeClientIntake> {
    const [practiceClientIntake] = await db
      .insert(practiceClientIntakes)
      .values(data)
      .returning();
    return practiceClientIntake;
  },

  findById: async function findById(
    id: string,
  ): Promise<SelectPracticeClientIntake | undefined> {
    const [result] = await db
      .select()
      .from(practiceClientIntakes)
      .where(eq(practiceClientIntakes.id, id))
      .limit(1);
    return result;
  },

  findByStripePaymentIntentId: async function findByStripePaymentIntentId(
    intentId: string,
  ): Promise<SelectPracticeClientIntake | undefined> {
    const [result] = await db
      .select()
      .from(practiceClientIntakes)
      .where(eq(practiceClientIntakes.stripePaymentIntentId, intentId))
      .limit(1);
    return result;
  },

  update: async function update(
    id: string,
    data: Partial<SelectPracticeClientIntake>,
  ): Promise<SelectPracticeClientIntake> {
    const [updated] = await db
      .update(practiceClientIntakes)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(practiceClientIntakes.id, id))
      .returning();
    return updated;
  },

  updateStatus: async function updateStatus(
    id: string,
    status: string,
  ): Promise<SelectPracticeClientIntake> {
    const [updated] = await db
      .update(practiceClientIntakes)
      .set({ status, updatedAt: new Date() })
      .where(eq(practiceClientIntakes.id, id))
      .returning();
    return updated;
  },

  listByOrganization: async function listByOrganization(
    organizationId: string,
    limit = 100,
    offset = 0,
  ): Promise<SelectPracticeClientIntake[]> {
    return await db
      .select()
      .from(practiceClientIntakes)
      .where(eq(practiceClientIntakes.organizationId, organizationId))
      .orderBy(desc(practiceClientIntakes.createdAt))
      .limit(limit)
      .offset(offset);
  },

  getStats: async function getStats(
    organizationId: string,
    startDate?: Date,
    endDate?: Date,
  ): Promise<{
    totalAmount: number;
    count: number;
    succeededCount: number;
  }> {
    const conditions = [eq(practiceClientIntakes.organizationId, organizationId)];

    if (startDate) {
      conditions.push(gte(practiceClientIntakes.createdAt, startDate));
    }

    if (endDate) {
      conditions.push(lte(practiceClientIntakes.createdAt, endDate));
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
  },
};
