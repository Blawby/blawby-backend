import { eq, and, desc } from 'drizzle-orm';

import {
  paymentIntents,
  type InsertPaymentIntent,
  type SelectPaymentIntent,
} from '@/modules/payments/database/schema/payment-intents.schema';
import { db } from '@/shared/database';

export const paymentIntentsRepository = {
  /**
   * Find payment intent by ID
   */
  async findById(id: string): Promise<SelectPaymentIntent | null> {
    const results = await db
      .select()
      .from(paymentIntents)
      .where(eq(paymentIntents.id, id))
      .limit(1);

    return results[0] || null;
  },

  /**
   * Find payment intent by Stripe payment intent ID
   */
  async findByStripePaymentIntentId(
    stripePaymentIntentId: string,
  ): Promise<SelectPaymentIntent | null> {
    const results = await db
      .select()
      .from(paymentIntents)
      .where(eq(paymentIntents.stripePaymentIntentId, stripePaymentIntentId))
      .limit(1);

    return results[0] || null;
  },

  /**
   * List payment intents by connected account
   */
  async listByConnectedAccountId(
    connectedAccountId: string,
    limit = 50,
    offset = 0,
  ): Promise<SelectPaymentIntent[]> {
    return await db
      .select()
      .from(paymentIntents)
      .where(eq(paymentIntents.connectedAccountId, connectedAccountId))
      .orderBy(desc(paymentIntents.createdAt))
      .limit(limit)
      .offset(offset);
  },

  /**
   * List payment intents by customer
   */
  async listByCustomerId(
    customerId: string,
    limit = 50,
    offset = 0,
  ): Promise<SelectPaymentIntent[]> {
    return await db
      .select()
      .from(paymentIntents)
      .where(eq(paymentIntents.customerId, customerId))
      .orderBy(desc(paymentIntents.createdAt))
      .limit(limit)
      .offset(offset);
  },

  /**
   * List payment intents by invoice
   */
  async listByInvoiceId(
    invoiceId: string,
    limit = 50,
    offset = 0,
  ): Promise<SelectPaymentIntent[]> {
    return await db
      .select()
      .from(paymentIntents)
      .where(eq(paymentIntents.invoiceId, invoiceId))
      .orderBy(desc(paymentIntents.createdAt))
      .limit(limit)
      .offset(offset);
  },

  /**
   * Create a new payment intent
   */
  async create(data: InsertPaymentIntent): Promise<SelectPaymentIntent> {
    const [result] = await db.insert(paymentIntents).values(data).returning();

    return result;
  },

  /**
   * Update payment intent
   */
  async update(
    id: string,
    data: Partial<InsertPaymentIntent>,
  ): Promise<SelectPaymentIntent | null> {
    const [result] = await db
      .update(paymentIntents)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(paymentIntents.id, id))
      .returning();

    return result || null;
  },

  /**
   * Update by Stripe payment intent ID
   */
  async updateByStripePaymentIntentId(
    stripePaymentIntentId: string,
    data: Partial<InsertPaymentIntent>,
  ): Promise<SelectPaymentIntent | null> {
    const [result] = await db
      .update(paymentIntents)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(paymentIntents.stripePaymentIntentId, stripePaymentIntentId))
      .returning();

    return result || null;
  },

  /**
   * Delete payment intent
   */
  async delete(id: string): Promise<boolean> {
    const result = await db
      .delete(paymentIntents)
      .where(eq(paymentIntents.id, id));

    return result.rowCount > 0;
  },

  /**
   * Get payment intents by status
   */
  async listByStatus(
    status: string,
    limit = 50,
    offset = 0,
  ): Promise<SelectPaymentIntent[]> {
    return await db
      .select()
      .from(paymentIntents)
      .where(
        eq(
          paymentIntents.status,
          status as
            | 'requires_payment_method'
            | 'requires_confirmation'
            | 'requires_action'
            | 'processing'
            | 'requires_capture'
            | 'canceled'
            | 'succeeded',
        ),
      )
      .orderBy(desc(paymentIntents.createdAt))
      .limit(limit)
      .offset(offset);
  },

  /**
   * Get successful payment intents for a connected account
   */
  async getSuccessfulPayments(
    connectedAccountId: string,
    limit = 50,
    offset = 0,
  ): Promise<SelectPaymentIntent[]> {
    return await db
      .select()
      .from(paymentIntents)
      .where(
        and(
          eq(paymentIntents.connectedAccountId, connectedAccountId),
          eq(
            paymentIntents.status,
            'succeeded' as
              | 'requires_payment_method'
              | 'requires_confirmation'
              | 'requires_action'
              | 'processing'
              | 'requires_capture'
              | 'canceled'
              | 'succeeded',
          ),
        ),
      )
      .orderBy(desc(paymentIntents.succeededAt))
      .limit(limit)
      .offset(offset);
  },

  /**
   * Get total amount for successful payments
   */
  async getTotalAmount(connectedAccountId: string): Promise<number> {
    const results = await db
      .select({ total: paymentIntents.amount })
      .from(paymentIntents)
      .where(
        and(
          eq(paymentIntents.connectedAccountId, connectedAccountId),
          eq(
            paymentIntents.status,
            'succeeded' as
              | 'requires_payment_method'
              | 'requires_confirmation'
              | 'requires_action'
              | 'processing'
              | 'requires_capture'
              | 'canceled'
              | 'succeeded',
          ),
        ),
      );

    return results.reduce((sum, row) => sum + row.total, 0);
  },
};
