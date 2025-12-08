/**
 * Subscription Plans Repository
 *
 * Data access layer for subscription plans
 */

import { eq, and, desc } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import * as schema from '@/schema';
import type { NewSubscriptionPlan, SubscriptionPlan } from '../schema/subscriptionPlans.schema';

/**
 * Find all active subscription plans sorted by sort order
 */
export const findAllActivePlans = async (
  db: NodePgDatabase<typeof schema>,
): Promise<SubscriptionPlan[]> => {
  return await db
    .select()
    .from(schema.subscriptionPlans)
    .where(eq(schema.subscriptionPlans.isActive, true))
    .orderBy(schema.subscriptionPlans.sortOrder);
};

/**
 * Find a subscription plan by ID (UUID)
 */
export const findPlanById = async (
  db: NodePgDatabase<typeof schema>,
  planId: string,
): Promise<SubscriptionPlan | undefined> => {
  const plans = await db
    .select()
    .from(schema.subscriptionPlans)
    .where(eq(schema.subscriptionPlans.id, planId))
    .limit(1);

  return plans[0];
};

/**
 * Find a subscription plan by name
 */
export const findPlanByName = async (
  db: NodePgDatabase<typeof schema>,
  name: string,
): Promise<SubscriptionPlan | undefined> => {
  const plans = await db
    .select()
    .from(schema.subscriptionPlans)
    .where(eq(schema.subscriptionPlans.name, name))
    .limit(1);

  return plans[0];
};

/**
 * Find a subscription plan by Stripe product ID
 */
export const findPlanByStripeProductId = async (
  db: NodePgDatabase<typeof schema>,
  stripeProductId: string,
): Promise<SubscriptionPlan | undefined> => {
  const plans = await db
    .select()
    .from(schema.subscriptionPlans)
    .where(eq(schema.subscriptionPlans.stripeProductId, stripeProductId))
    .limit(1);

  return plans[0];
};

/**
 * Find a subscription plan by Stripe price ID (monthly or yearly)
 */
export const findPlanByStripePriceId = async (
  db: NodePgDatabase<typeof schema>,
  stripePriceId: string,
): Promise<SubscriptionPlan | undefined> => {
  const plans = await db
    .select()
    .from(schema.subscriptionPlans)
    .where(
      and(
        eq(schema.subscriptionPlans.stripeMonthlyPriceId, stripePriceId),
      ),
    )
    .limit(1);

  if (plans.length > 0) {
    return plans[0];
  }

  // Try yearly price
  const yearlyPlans = await db
    .select()
    .from(schema.subscriptionPlans)
    .where(
      and(
        eq(schema.subscriptionPlans.stripeYearlyPriceId, stripePriceId),
      ),
    )
    .limit(1);

  return yearlyPlans[0];
};

/**
 * Create or update a subscription plan
 */
export const upsertPlan = async (
  db: NodePgDatabase<typeof schema>,
  planData: NewSubscriptionPlan,
): Promise<SubscriptionPlan> => {
  // Try to find existing plan by stripe product ID
  const existingPlan = await findPlanByStripeProductId(db, planData.stripeProductId);

  if (existingPlan) {
    // Update existing plan
    const updated = await db
      .update(schema.subscriptionPlans)
      .set({
        ...planData,
        updatedAt: new Date(),
      })
      .where(eq(schema.subscriptionPlans.id, existingPlan.id))
      .returning();

    return updated[0];
  }

  // Create new plan
  const created = await db
    .insert(schema.subscriptionPlans)
    .values(planData)
    .returning();

  return created[0];
};

/**
 * Deactivate a subscription plan (soft delete)
 */
export const deactivatePlan = async (
  db: NodePgDatabase<typeof schema>,
  stripeProductId: string,
): Promise<SubscriptionPlan | undefined> => {
  const updated = await db
    .update(schema.subscriptionPlans)
    .set({
      isActive: false,
      updatedAt: new Date(),
    })
    .where(eq(schema.subscriptionPlans.stripeProductId, stripeProductId))
    .returning();

  return updated[0];
};

/**
 * Get all plans (including inactive) for admin purposes
 */
export const findAllPlans = async (
  db: NodePgDatabase<typeof schema>,
): Promise<SubscriptionPlan[]> => {
  return await db
    .select()
    .from(schema.subscriptionPlans)
    .orderBy(desc(schema.subscriptionPlans.createdAt));
};

