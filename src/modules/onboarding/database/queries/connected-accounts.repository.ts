/**
 * Connected Accounts Repository
 *
 * Database operations for connected accounts
 */

import { eq } from 'drizzle-orm';

import { stripeConnectedAccounts } from '@/modules/onboarding/schemas/onboarding.schema';
import { db } from '@/shared/database';

export type SelectConnectedAccount
  = typeof stripeConnectedAccounts.$inferSelect;
export type InsertConnectedAccount
  = typeof stripeConnectedAccounts.$inferInsert;

/**
 * Find connected account by Stripe account ID
 */
export const findByStripeAccountId = async function findByStripeAccountId(
  stripeAccountId: string,
): Promise<SelectConnectedAccount | undefined> {
  const [account] = await db
    .select()
    .from(stripeConnectedAccounts)
    .where(eq(stripeConnectedAccounts.stripe_account_id, stripeAccountId))
    .limit(1);

  return account;
};

/**
 * Find connected account by organization ID
 */
export const findByOrganizationId = async function findByOrganizationId(
  organizationId: string,
): Promise<SelectConnectedAccount | undefined> {
  const [account] = await db
    .select()
    .from(stripeConnectedAccounts)
    .where(eq(stripeConnectedAccounts.organization_id, organizationId))
    .limit(1);

  return account;
};

/**
 * Create a new connected account
 */
export const create = async function create(
  data: InsertConnectedAccount,
): Promise<SelectConnectedAccount> {
  const [account] = await db
    .insert(stripeConnectedAccounts)
    .values(data)
    .returning();

  return account;
};

/**
 * Update connected account
 */
export const update = async function update(
  id: string,
  data: Partial<InsertConnectedAccount>,
): Promise<SelectConnectedAccount | undefined> {
  const [account] = await db
    .update(stripeConnectedAccounts)
    .set(data)
    .where(eq(stripeConnectedAccounts.id, id))
    .returning();

  return account;
};

/**
 * Find connected account by ID
 */
export const findById = async function findById(
  id: string,
): Promise<SelectConnectedAccount | undefined> {
  const [account] = await db
    .select()
    .from(stripeConnectedAccounts)
    .where(eq(stripeConnectedAccounts.id, id))
    .limit(1);

  return account;
};

/**
 * Delete connected account
 */
export const deleteById = async function deleteById(
  id: string,
): Promise<boolean> {
  const result = await db
    .delete(stripeConnectedAccounts)
    .where(eq(stripeConnectedAccounts.id, id));

  return (result.rowCount ?? 0) > 0;
};

export const stripeConnectedAccountsRepository = {
  findById,
  findByStripeAccountId,
  findByOrganizationId,
  create,
  update,
  deleteById,
};

// Alias for backward compatibility
export const connectedAccountsRepository = stripeConnectedAccountsRepository;
