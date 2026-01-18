/**
 * Onboarding Repository
 *
 * Centralized database operations for connected accounts and related onboarding data.
 */

import { eq, and, lte } from 'drizzle-orm';
import {
  stripeConnectedAccounts,
} from '@/modules/onboarding/schemas/onboarding.schema';
import type {
  StripeConnectedAccount,
  NewStripeConnectedAccount,
} from '@/modules/onboarding/schemas/onboarding.schema';
import { db } from '@/shared/database';
import {
  webhookEvents,
  type WebhookEvent,
} from '@/shared/schemas/stripe.webhook-events.schema';

/**
 * Connected Account Operations
 */

export const findByOrganizationId = async (
  organizationId: string,
): Promise<StripeConnectedAccount | null> => {
  const [account] = await db
    .select()
    .from(stripeConnectedAccounts)
    .where(eq(stripeConnectedAccounts.organization_id, organizationId))
    .limit(1);

  return account || null;
};

export const findByStripeAccountId = async (
  stripeAccountId: string,
): Promise<StripeConnectedAccount | null> => {
  const [account] = await db
    .select()
    .from(stripeConnectedAccounts)
    .where(eq(stripeConnectedAccounts.stripe_account_id, stripeAccountId))
    .limit(1);

  return account || null;
};

export const findById = async (
  id: string,
): Promise<StripeConnectedAccount | null> => {
  const [account] = await db
    .select()
    .from(stripeConnectedAccounts)
    .where(eq(stripeConnectedAccounts.id, id))
    .limit(1);

  return account || null;
};

export const create = async (
  data: NewStripeConnectedAccount,
): Promise<StripeConnectedAccount> => {
  const [account] = await db
    .insert(stripeConnectedAccounts)
    .values({
      ...data,
      updated_at: new Date(),
    })
    .returning();

  return account;
};

export const update = async (
  id: string,
  data: Partial<NewStripeConnectedAccount>,
): Promise<StripeConnectedAccount | null> => {
  const [account] = await db
    .update(stripeConnectedAccounts)
    .set({
      ...data,
      updated_at: new Date(),
    })
    .where(eq(stripeConnectedAccounts.id, id))
    .returning();

  return account || null;
};

export const updateByStripeAccountId = async (
  stripeAccountId: string,
  data: Partial<NewStripeConnectedAccount>,
): Promise<StripeConnectedAccount | null> => {
  const [account] = await db
    .update(stripeConnectedAccounts)
    .set({
      ...data,
      updated_at: new Date(),
    })
    .where(eq(stripeConnectedAccounts.stripe_account_id, stripeAccountId))
    .returning();

  return account || null;
};

export const updateLastRefreshed = async (
  stripeAccountId: string,
): Promise<void> => {
  await db
    .update(stripeConnectedAccounts)
    .set({
      last_refreshed_at: new Date(),
      updated_at: new Date(),
    })
    .where(eq(stripeConnectedAccounts.stripe_account_id, stripeAccountId));
};

/**
 * Webhook Event Operations (Module Specific)
 */

export const getEventsToRetry = async (): Promise<WebhookEvent[]> => {
  const now = new Date();
  return await db
    .select()
    .from(webhookEvents)
    .where(
      and(
        eq(webhookEvents.processed, false),
        lte(webhookEvents.nextRetryAt, now),
      ),
    );
};

export const findWebhookById = async (
  id: string,
): Promise<WebhookEvent | null> => {
  const [event] = await db
    .select()
    .from(webhookEvents)
    .where(eq(webhookEvents.id, id))
    .limit(1);

  return event || null;
};

/**
 * Repository Object Export (Matches newer patterns)
 */
export const onboardingRepository = {
  findById,
  findByOrganizationId,
  findByStripeAccountId,
  create,
  update,
  updateByStripeAccountId,
  updateLastRefreshed,
  getEventsToRetry,
  findWebhookById,
};

// Aliases for compatibility during migration
export const connectedAccountsRepository = onboardingRepository;
export const stripeConnectedAccountsRepository = onboardingRepository;
