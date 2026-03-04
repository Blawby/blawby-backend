import { eq, and, lte, isNotNull } from 'drizzle-orm';
import type { Stripe } from 'stripe';

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
export const stripeWebhookEventsRepository = {
  /**
   * Check if a webhook event exists by its Stripe Event ID.
   */
  async existsByStripeEventId(
    stripeEventId: string,
  ): Promise<WebhookEvent | null> {
    const events = await db
      .select()
      .from(webhookEvents)
      .where(eq(webhookEvents.stripeEventId, stripeEventId))
      .limit(1);

    return events[0] || null;
  },

  /**
   * Create a new webhook event.
   */
  async create(
    event: Stripe.Event,
    headers: Record<string, string>,
    url: string,
  ): Promise<WebhookEvent> {
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
  },

  /**
   * Creates a webhook event only if it doesn't exist yet (based on stripeEventId).
   * Returns the event if created, or null if it already existed.
   */
  async createIfNotExists(
    event: Stripe.Event,
    headers: Record<string, string>,
    url: string,
  ): Promise<WebhookEvent | null> {
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
      .onConflictDoNothing({ target: webhookEvents.stripeEventId })
      .returning();

    return webhookEvent || null;
  },

  /**
   * Find a webhook event by its internal database ID.
   */
  async findById(
    id: string,
  ): Promise<WebhookEvent | null> {
    const events = await db
      .select()
      .from(webhookEvents)
      .where(eq(webhookEvents.id, id))
      .limit(1);

    return events[0] || null;
  },

  /**
   * Mark a webhook event as successfully processed.
   */
  async markProcessed(id: string): Promise<void> {
    await db
      .update(webhookEvents)
      .set({
        processed: true,
        processedAt: new Date(),
      })
      .where(eq(webhookEvents.id, id));
  },

  /**
   * Mark a webhook event as failed and schedule a retry.
   */
  async markFailed(
    id: string,
    error: string,
    errorStack?: string,
  ): Promise<void> {
    const event = await stripeWebhookEventsRepository.findById(id);
    if (!event) return;

    const retryCount = event.retryCount + 1;
    const hasMoreRetries = retryCount < event.maxRetries;
    const nextRetryAt = hasMoreRetries
      ? new Date(Date.now() + Math.pow(2, retryCount) * 60 * 1000) // Exponential backoff
      : null;

    await db
      .update(webhookEvents)
      .set({
        retryCount,
        error,
        errorStack,
        nextRetryAt,
        processed: false,
      })
      .where(eq(webhookEvents.id, id));
  },

  /**
   * Get generic webhook events that need retrying.
   */
  async getEventsToRetry(): Promise<WebhookEvent[]> {
    const now = new Date();
    return await db
      .select()
      .from(webhookEvents)
      .where(
        and(
          eq(webhookEvents.processed, false),
          isNotNull(webhookEvents.nextRetryAt),
          lte(webhookEvents.nextRetryAt, now),
        ),
      );
  },
};

// Legacy exports for partial migration support if needed
export const existsByStripeEventId = stripeWebhookEventsRepository.existsByStripeEventId;
export const createWebhookEvent = stripeWebhookEventsRepository.create;
export const createWebhookEventIfNotExists = stripeWebhookEventsRepository.createIfNotExists;
export const findWebhookById = stripeWebhookEventsRepository.findById;
export const markWebhookProcessed = stripeWebhookEventsRepository.markProcessed;
export const markWebhookFailed = stripeWebhookEventsRepository.markFailed;
