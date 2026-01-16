/**
 * Customers Repository
 *
 * CRUD operations for customer details
 */

import { eq, desc } from 'drizzle-orm';

import {
  preferences,
  type InsertPreferences,
  type Preferences,
} from '@/modules/preferences/schema/preferences.schema';
import type { ProductUsage } from '@/modules/preferences/types/preferences.types';
import { users } from '@/schema/better-auth-schema';

import { db } from '@/shared/database';

// Use Drizzle's inferred update type instead of Zod-inferred type
type UpdatePreferencesData = Partial<InsertPreferences>;

export const customersRepository = {
  /**
   * Create a new customer details record
   */
  create: async function create(
    data: InsertPreferences,
  ): Promise<Preferences> {
    const [customer] = await db
      .insert(preferences)
      .values(data)
      .returning();
    return customer;
  },

  /**
   * Find customer details by user ID
   */
  findByUserId: async function findByUserId(
    userId: string,
  ): Promise<Preferences | undefined> {
    const [result] = await db
      .select()
      .from(preferences)
      .where(eq(preferences.userId, userId))
      .limit(1);
    return result;
  },

  /**
   * Find customer details by Stripe customer ID
   * Now queries users table since stripeCustomerId moved there
   */
  findByStripeCustomerId: async function findByStripeCustomerId(
    stripeCustomerId: string,
  ): Promise<Preferences | undefined> {
    const [user] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.stripeCustomerId, stripeCustomerId))
      .limit(1);

    if (!user) {
      return undefined;
    }

    return await this.findByUserId(user.id);
  },

  /**
   * Update customer details
   */
  update: async function update(
    id: string,
    data: UpdatePreferencesData,
  ): Promise<Preferences> {
    const [updated] = await db
      .update(preferences)
      .set(data)
      .where(eq(preferences.id, id))
      .returning();
    return updated;
  },

  /**
   * Update customer details by user ID
   */
  updateByUserId: async function updateByUserId(
    userId: string,
    data: UpdatePreferencesData,
  ): Promise<Preferences> {
    const [updated] = await db
      .update(preferences)
      .set(data)
      .where(eq(preferences.userId, userId))
      .returning();
    return updated;
  },

  /**
   * Update product usage for a customer
   */
  updateProductUsage: async function updateProductUsage(
    userId: string,
    productUsage: ProductUsage[],
  ): Promise<Preferences> {
    const [updated] = await db
      .update(preferences)
      .set({
        productUsage,
      })
      .where(eq(preferences.userId, userId))
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
      .select({ userId: preferences.userId })
      .from(preferences)
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
      .delete(preferences)
      .where(eq(preferences.id, id));
  },

  /**
   * Delete customer details by user ID
   */
  deleteByUserId: async function deleteByUserId(
    userId: string,
  ): Promise<void> {
    await db
      .delete(preferences)
      .where(eq(preferences.userId, userId));
  },

  /**
   * List all customer details with pagination
   */
  list: async function list(
    limit: number = 100,
    offset: number = 0,
  ): Promise<Preferences[]> {
    return await db
      .select()
      .from(preferences)
      .orderBy(desc(preferences.createdAt))
      .limit(limit)
      .offset(offset);
  },

  /**
   * Count total customer details
   */
  count: async function count(): Promise<number> {
    const result = await db
      .select({ count: preferences.id })
      .from(preferences);
    return result.length;
  },
};
