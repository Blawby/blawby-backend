import { eq, and, lte } from 'drizzle-orm';

import {
  stripeConnectedAccounts,
  type StripeConnectedAccount,
  type NewStripeConnectedAccount,
} from '@/modules/onboarding/schemas/onboarding.schema';
import { db } from '@/shared/database';
import {
  webhookEvents,
  type WebhookEvent,
} from '@/shared/schemas/stripe.webhook-events.schema';

export const findByOrganization = async (
  organizationId: string,
): Promise<StripeConnectedAccount | null> => {
  const accounts = await db
    .select()
    .from(stripeConnectedAccounts)
    .where(eq(stripeConnectedAccounts.organization_id, organizationId))
    .limit(1);

  return accounts[0] || null;
};

export const findByStripeId = async (
  stripeAccountId: string,
): Promise<StripeConnectedAccount | null> => {
  const accounts = await db
    .select()
    .from(stripeConnectedAccounts)
    .where(eq(stripeConnectedAccounts.stripe_account_id, stripeAccountId))
    .limit(1);

  return accounts[0] || null;
};

export const findById = async (
  id: string,
): Promise<StripeConnectedAccount | null> => {
  const accounts = await db
    .select()
    .from(stripeConnectedAccounts)
    .where(eq(stripeConnectedAccounts.id, id))
    .limit(1);

  return accounts[0] || null;
};

export const createStripeConnectedAccount = async (
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

export const updateStripeConnectedAccount = async (
  id: string,
  data: Partial<NewStripeConnectedAccount>,
): Promise<StripeConnectedAccount> => {
  const [account] = await db
    .update(stripeConnectedAccounts)
    .set({
      ...data,
      updated_at: new Date(),
    })
    .where(eq(stripeConnectedAccounts.id, id))
    .returning();

  return account;
};

export const updateStripeConnectedAccountByStripeId = async (
  stripeAccountId: string,
  data: Partial<NewStripeConnectedAccount>,
): Promise<StripeConnectedAccount> => {
  const [account] = await db
    .update(stripeConnectedAccounts)
    .set({
      ...data,
      updated_at: new Date(),
    })
    .where(eq(stripeConnectedAccounts.stripe_account_id, stripeAccountId))
    .returning();

  return account;
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
  const events = await db
    .select()
    .from(webhookEvents)
    .where(eq(webhookEvents.id, id))
    .limit(1);

  return events[0] || null;
};
