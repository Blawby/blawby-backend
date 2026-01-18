/**
 * Onboarding Webhooks Service
 *
 * Handles processing of Stripe webhook events related to onboarding and account setup.
 * Uses the onboarding_webhook_events table for storage and processing.
 * Focuses on account updates, capabilities, and external account management.
 */

import { getLogger } from '@logtape/logtape';
import Stripe from 'stripe';
import { type Result, ok, internalError } from '@/shared/types/result';
import onboardingHandlers from '@/modules/onboarding/handlers';
import { getEventsToRetry } from '@/modules/onboarding/database/queries/onboarding.repository';
import {
  createWebhookEventIfNotExists,
  markWebhookProcessed,
  markWebhookFailed,
  existsByStripeEventId,
} from '@/shared/repositories/stripe.webhook-events.repository';
import { stripe } from '@/shared/utils/stripe-client';
import { addOnboardingWebhookJob } from '@/shared/queue/queue.manager';

const logger = getLogger(['onboarding', 'webhook-service']);

const {
  handleAccountUpdated,
  handleCapabilityUpdated,
  handleExternalAccountCreated,
  handleExternalAccountUpdated,
  handleExternalAccountDeleted,
} = onboardingHandlers;

/**
 * Generic webhook verification and storage function
 * Accepts a webhook secret to support different webhook endpoints
 */
export const verifyAndStoreWithSecret = async (
  rawBody: string | Buffer,
  signature: string,
  headers: Record<string, string>,
  url: string,
  webhookSecret: string,
): Promise<{
  event: Stripe.Event;
  alreadyProcessed: boolean;
  webhookId?: string;
}> => {
  if (!webhookSecret) {
    const error = new Error('Webhook secret is required');
    (error as any).code = 'STRIPE_SECRET_MISSING';
    throw error;
  }

  // Verify signature using Stripe SDK
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      webhookSecret,
    );
  } catch {
    const error = new Error('Invalid signature');
    (error as any).code = 'INVALID_SIGNATURE';
    throw error;
  }

  // Atomic verify and store
  const webhookEvent = await createWebhookEventIfNotExists(
    event,
    headers,
    url
  );

  if (!webhookEvent) {
    // Check if it already exists to determine processing status
    const existing = await existsByStripeEventId(event.id);
    return { event, alreadyProcessed: existing?.processed ?? true };
  }

  return { event, alreadyProcessed: false, webhookId: webhookEvent.id };
};

/**
 * Verify and store Connect webhook (for onboarding/connected accounts)
 * Uses STRIPE_CONNECT_WEBHOOK_SECRET
 */
export const verifyAndStore = async (
  rawBody: string | Buffer,
  signature: string,
  headers: Record<string, string>,
  url: string,
): Promise<{
  event: Stripe.Event;
  alreadyProcessed: boolean;
  webhookId?: string;
}> => {
  const webhookSecret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET;

  if (!webhookSecret) {
    const error = new Error('STRIPE_CONNECT_WEBHOOK_SECRET environment variable is required for Connect webhooks');
    (error as any).code = 'STRIPE_SECRET_MISSING';
    throw error;
  }

  return verifyAndStoreWithSecret(rawBody, signature, headers, url, webhookSecret);
};

/**
 * Verify and store main Stripe webhook (for payments, invoices, etc.)
 * Uses STRIPE_WEBHOOK_SECRET
 */
export const verifyAndStoreAccount = async (
  rawBody: string | Buffer,
  signature: string,
  headers: Record<string, string>,
  url: string,
): Promise<{
  event: Stripe.Event;
  alreadyProcessed: boolean;
  webhookId?: string;
}> => {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    const error = new Error('STRIPE_WEBHOOK_SECRET environment variable is required for main webhooks');
    (error as any).code = 'STRIPE_SECRET_MISSING';
    throw error;
  }

  return verifyAndStoreWithSecret(rawBody, signature, headers, url, webhookSecret);
};


export const processEvent = async (eventId: string): Promise<Result<void>> => {
  const webhookEvent = await existsByStripeEventId(eventId);

  if (!webhookEvent) {
    logger.error("Webhook event not found: {eventId}", { eventId });
    return ok(undefined);
  }

  if (webhookEvent.processed) {
    logger.info("Webhook event already processed: {eventId}", { eventId });
    return ok(undefined);
  }

  try {
    const event = webhookEvent.payload as Stripe.Event;

    // Process based on event type - onboarding related events only
    switch (event.type) {
      case 'account.updated':
        await handleAccountUpdatedWebhook(event);
        break;

      case 'capability.updated':
        await handleCapabilityUpdatedWebhook(event);
        break;

      case 'account.external_account.created':
        await handleExternalAccountCreatedWebhook(event);
        break;

      case 'account.external_account.updated':
        await handleExternalAccountUpdatedWebhook(event);
        break;

      case 'account.external_account.deleted':
        await handleExternalAccountDeletedWebhook(event);
        break;

      default:
        logger.info("Unhandled onboarding webhook event type: {eventType}", { eventType: event.type });
    }

    // Mark as processed
    await markWebhookProcessed(webhookEvent.id);
    logger.info("Successfully processed webhook event: {eventId} ({eventType})", {
      eventId,
      eventType: event.type
    });
    return ok(undefined);
  } catch (error) {
    const errorMessage
      = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : undefined;

    // Mark as failed (increments retry count, sets next retry time)
    await markWebhookFailed(webhookEvent.id, errorMessage, errorStack);

    logger.error("Failed to process webhook event {eventId}: {error}", {
      eventId,
      error: errorMessage,
      stack: errorStack,
    });

    return internalError(errorMessage);
  }
};

const handleAccountUpdatedWebhook = async (
  event: Stripe.Event,
): Promise<void> => {
  const account = event.data.object as Stripe.Account;

  if (!account.id) {
    logger.error("Account ID missing from account.updated event: {eventId}", { eventId: event.id });
    return;
  }

  await handleAccountUpdated(account);
};

const handleCapabilityUpdatedWebhook = async (
  event: Stripe.Event,
): Promise<void> => {
  const capability = event.data.object as Stripe.Capability;

  if (!capability.account) {
    logger.error("Account ID missing from capability.updated event: {eventId}", { eventId: event.id });
    return;
  }

  await handleCapabilityUpdated(capability);
};

const handleExternalAccountCreatedWebhook = async (
  event: Stripe.Event,
): Promise<void> => {
  const externalAccount = event.data.object as Stripe.ExternalAccount;

  if (!externalAccount.account) {
    logger.error("Account ID missing from account.external_account.created event: {eventId}", { eventId: event.id });
    return;
  }

  await handleExternalAccountCreated(externalAccount);
};

const handleExternalAccountUpdatedWebhook = async (
  event: Stripe.Event,
): Promise<void> => {
  const externalAccount = event.data.object as Stripe.ExternalAccount;

  if (!externalAccount.account) {
    logger.error("Account ID missing from account.external_account.updated event: {eventId}", { eventId: event.id });
    return;
  }

  await handleExternalAccountUpdated(externalAccount);
};

const handleExternalAccountDeletedWebhook = async (
  event: Stripe.Event,
): Promise<void> => {
  const externalAccount = event.data.object as Stripe.ExternalAccount;

  if (!externalAccount.account) {
    logger.error("Account ID missing from account.external_account.deleted event: {eventId}", { eventId: event.id });
    return;
  }

  await handleExternalAccountDeleted(externalAccount);
};

export const retryFailedWebhooks = async (): Promise<void> => {
  const eventsToRetry = await getEventsToRetry();

  if (eventsToRetry.length > 0) {
    logger.info("Found {count} webhook events to retry", { count: eventsToRetry.length });
  }

  for (const event of eventsToRetry) {
    if (event.retryCount >= event.maxRetries) {
      continue;
    }

    try {
      await processEvent(event.stripeEventId);
    } catch (error) {
      logger.error("Failed to retry webhook event {stripeEventId}: {error}", {
        stripeEventId: event.stripeEventId,
        retryCount: event.retryCount,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
};

export const processWebhookAsync = async (
  eventId: string,
  webhookId?: string,
  eventType?: string,
): Promise<void> => {
  try {
    let wId = webhookId;
    let type = eventType;

    if (!wId || !type) {
      const webhookEvent = await existsByStripeEventId(eventId);
      if (webhookEvent) {
        wId = webhookEvent.id;
        type = webhookEvent.eventType;
      }
    }

    if (wId && type) {
      await addOnboardingWebhookJob(wId, eventId, type);
    } else {
      const errorMsg = `Cannot queue webhook job: Missing metadata for ${eventId}`;
      logger.error(errorMsg);
      throw new Error(errorMsg);
    }
  } catch (error) {
    logger.error("Failed to queue onboarding webhook job for {eventId}: {error}", {
      eventId,
      error
    });
    throw error;
  }
};
