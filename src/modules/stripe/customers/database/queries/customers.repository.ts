/**
 * Customers Repository
 *
 * CRUD operations for customer details
 */

import { eq, desc } from 'drizzle-orm';

import {
  userDetails,
  type InsertUserDetails,
  type UserDetails,
  type UpdateUserDetails,
  type ProductUsage,
} from '@/modules/user-details/schema/user-details.schema';

import { db } from '@/shared/database';

export const customersRepository = {
  /**
   * Create a new customer details record
   */
  create: async function create(
    data: InsertUserDetails,
  ): Promise<UserDetails> {
    const [customer] = await db
      .insert(userDetails)
      .values(data)
      .returning();
    return customer;
  },

  /**
   * Find customer details by user ID
   */
  findByUserId: async function findByUserId(
    userId: string,
  ): Promise<UserDetails | undefined> {
    const [result] = await db
      .select()
      .from(userDetails)
      .where(eq(userDetails.userId, userId))
      .limit(1);
    return result;
  },

  /**
   * Find customer details by Stripe customer ID
   */
  findByStripeCustomerId: async function findByStripeCustomerId(
    stripeCustomerId: string,
  ): Promise<UserDetails | undefined> {
    const [result] = await db
      .select()
      .from(userDetails)
      .where(eq(userDetails.stripeCustomerId, stripeCustomerId))
      .limit(1);
    return result;
  },

  /**
   * Update customer details
   */
  update: async function update(
    id: string,
    data: UpdateUserDetails,
  ): Promise<UserDetails> {
    const [updated] = await db
      .update(userDetails)
      .set(data)
      .where(eq(userDetails.id, id))
      .returning();
    return updated;
  },

  /**
   * Update customer details by user ID
   */
  updateByUserId: async function updateByUserId(
    userId: string,
    data: UpdateUserDetails,
  ): Promise<UserDetails> {
    const [updated] = await db
      .update(userDetails)
      .set(data)
      .where(eq(userDetails.userId, userId))
      .returning();
    return updated;
  },

  /**
   * Update product usage for a customer
   */
  updateProductUsage: async function updateProductUsage(
    userId: string,
    productUsage: ProductUsage[],
  ): Promise<UserDetails> {
    const [updated] = await db
      .update(userDetails)
      .set({
        productUsage,
      })
      .where(eq(userDetails.userId, userId))
      .returning();
    return updated;
  },

  /**
   * Get users without Stripe customer (for backfill)
   */
  getUsersWithoutStripeCustomer: async function getUsersWithoutStripeCustomer(
    limit: number = 100,
  ): Promise<string[]> {
    // Get users that don't have customer details
    const usersWithoutCustomer = await db
      .select({ userId: userDetails.userId })
      .from(userDetails)
      .limit(limit);

    // This is a simplified version - in practice, you'd want to join with users table
    // and get users that don't have customer details
    return usersWithoutCustomer.map((row) => row.userId);
  },

  /**
   * Delete customer details
   */
  delete: async function deleteCustomer(
    id: string,
  ): Promise<void> {
    await db
      .delete(userDetails)
      .where(eq(userDetails.id, id));
  },

  /**
   * Delete customer details by user ID
   */
  deleteByUserId: async function deleteByUserId(
    userId: string,
  ): Promise<void> {
    await db
      .delete(userDetails)
      .where(eq(userDetails.userId, userId));
  },

  /**
   * List all customer details with pagination
   */
  list: async function list(
    limit: number = 100,
    offset: number = 0,
  ): Promise<UserDetails[]> {
    return await db
      .select()
      .from(userDetails)
      .orderBy(desc(userDetails.createdAt))
      .limit(limit)
      .offset(offset);
  },

  /**
   * Count total customer details
   */
  count: async function count(): Promise<number> {
    const result = await db
      .select({ count: userDetails.id })
      .from(userDetails);
    return result.length;
  },
};
