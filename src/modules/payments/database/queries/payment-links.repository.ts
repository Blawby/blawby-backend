import { eq, desc } from 'drizzle-orm';

import {
  paymentLinks,
  type InsertPaymentLink,
  type SelectPaymentLink,
} from '../schema/payment-links.schema';

import { db } from '@/shared/database';

export const paymentLinksRepository = {
  create: async function create(
    data: InsertPaymentLink,
  ): Promise<SelectPaymentLink> {
    const [paymentLink] = await db
      .insert(paymentLinks)
      .values(data)
      .returning();
    return paymentLink;
  },

  findByUlid: async function findByUlid(
    ulid: string,
  ): Promise<SelectPaymentLink | undefined> {
    return await db.query.paymentLinks.findFirst({
      where: eq(paymentLinks.ulid, ulid),
    });
  },

  findByStripePaymentIntentId: async function findByStripePaymentIntentId(
    intentId: string,
  ): Promise<SelectPaymentLink | undefined> {
    return await db.query.paymentLinks.findFirst({
      where: eq(paymentLinks.stripePaymentIntentId, intentId),
    });
  },

  update: async function update(
    id: string,
    data: Partial<SelectPaymentLink>,
  ): Promise<SelectPaymentLink> {
    const [updated] = await db
      .update(paymentLinks)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(paymentLinks.id, id))
      .returning();
    return updated;
  },

  listByOrganization: async function listByOrganization(
    organizationId: string,
    limit = 100,
  ): Promise<SelectPaymentLink[]> {
    return await db.query.paymentLinks.findMany({
      where: eq(paymentLinks.organizationId, organizationId),
      orderBy: [desc(paymentLinks.createdAt)],
      limit,
    });
  },
};
