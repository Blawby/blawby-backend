import { eq } from 'drizzle-orm';
import type Stripe from 'stripe';

import { db } from '@/shared/database';
import {
  webhookEvents,
  type WebhookEvent,
  type NewWebhookEvent,
} from '@/shared/schemas/stripe.webhook-events.schema';

/**
 * Shared Webhook Events Repository
 *
 * Provides database operations for webhook events used by both
 * Stripe payment webhooks and Stripe Connect onboarding webhooks.
 */
export const existsByStripeEventId = async (
  stripeEventId: string,
): Promise<WebhookEvent | null> => {
  const events = await db
    .select()
    .from(webhookEvents)
    .where(eq(webhookEvents.stripeEventId, stripeEventId))
    .limit(1);

  return events[0] || null;
};

export const createWebhookEvent = async (
  event: Stripe.Event,
  headers: Record<string, string>,
  url: string,
): Promise<WebhookEvent> => {
  const newEvent: NewWebhookEvent = {
    stripeEventId: event.id,
    eventType: event.type,
    payload: event,
    headers,
    url,
  };

  const [webhookEvent] = await db
    .insert(webhookEvents)
    .values(newEvent)
    .returning();

  return webhookEvent;
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

export const markWebhookProcessed = async (id: string): Promise<void> => {
  await db
    .update(webhookEvents)
    .set({
      processed: true,
      processedAt: new Date(),
    })
    .where(eq(webhookEvents.id, id));
};

export const markWebhookFailed = async (
  id: string,
  error: string,
  errorStack?: string,
): Promise<void> => {
  const event = await findWebhookById(id);
  if (!event) return;

  const retryCount = event.retryCount + 1;
  const nextRetryAt
    = retryCount < event.maxRetries
      ? new Date(Date.now() + Math.pow(2, retryCount) * 60 * 1000) // Exponential backoff
      : null;

  await db
    .update(webhookEvents)
    .set({
      retryCount,
      error,
      errorStack,
      nextRetryAt,
    })
    .where(eq(webhookEvents.id, id));
};
