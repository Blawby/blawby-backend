import { eq, desc, and, gte, lte } from 'drizzle-orm';

import {
  intakePayments,
  type InsertIntakePayment,
  type SelectIntakePayment,
} from '@/modules/intake-payments/database/schema/intake-payments.schema';

import { db } from '@/shared/database';

export const intakePaymentsRepository = {
  create: async function create(
    data: InsertIntakePayment,
  ): Promise<SelectIntakePayment> {
    const [intakePayment] = await db
      .insert(intakePayments)
      .values(data)
      .returning();
    return intakePayment;
  },

  findById: async function findById(
    id: string,
  ): Promise<SelectIntakePayment | undefined> {
    const [result] = await db
      .select()
      .from(intakePayments)
      .where(eq(intakePayments.id, id))
      .limit(1);
    return result;
  },

  findByUlid: async function findByUlid(
    ulid: string,
  ): Promise<SelectIntakePayment | undefined> {
    const [result] = await db
      .select()
      .from(intakePayments)
      .where(eq(intakePayments.ulid, ulid))
      .limit(1);
    return result;
  },

  findByStripePaymentIntentId: async function findByStripePaymentIntentId(
    intentId: string,
  ): Promise<SelectIntakePayment | undefined> {
    const [result] = await db
      .select()
      .from(intakePayments)
      .where(eq(intakePayments.stripePaymentIntentId, intentId))
      .limit(1);
    return result;
  },

  update: async function update(
    id: string,
    data: Partial<SelectIntakePayment>,
  ): Promise<SelectIntakePayment> {
    const [updated] = await db
      .update(intakePayments)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(intakePayments.id, id))
      .returning();
    return updated;
  },

  updateStatus: async function updateStatus(
    id: string,
    status: string,
  ): Promise<SelectIntakePayment> {
    const [updated] = await db
      .update(intakePayments)
      .set({ status, updatedAt: new Date() })
      .where(eq(intakePayments.id, id))
      .returning();
    return updated;
  },

  listByOrganization: async function listByOrganization(
    organizationId: string,
    limit = 100,
    offset = 0,
  ): Promise<SelectIntakePayment[]> {
    return await db
      .select()
      .from(intakePayments)
      .where(eq(intakePayments.organizationId, organizationId))
      .orderBy(desc(intakePayments.createdAt))
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
    const conditions = [eq(intakePayments.organizationId, organizationId)];

    if (startDate) {
      conditions.push(gte(intakePayments.createdAt, startDate));
    }

    if (endDate) {
      conditions.push(lte(intakePayments.createdAt, endDate));
    }

    const results = await db
      .select({
        totalAmount: intakePayments.amount,
        status: intakePayments.status,
      })
      .from(intakePayments)
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
