/**
 * Onboarding Webhooks Service
 *
 * Handles processing of Stripe webhook events related to onboarding and account setup.
 * Uses the onboarding_webhook_events table for storage and processing.
 * Focuses on account updates, capabilities, and external account management.
 */

import Stripe from 'stripe';

import { handleAccountUpdated } from '@/modules/onboarding/handlers/account-updated.handler';
import { handleCapabilityUpdated } from '@/modules/onboarding/handlers/capability-updated.handler';
import { handleExternalAccountCreated } from '@/modules/onboarding/handlers/external-account-created.handler';
import { handleExternalAccountDeleted } from '@/modules/onboarding/handlers/external-account-deleted.handler';
import { handleExternalAccountUpdated } from '@/modules/onboarding/handlers/external-account-updated.handler';
import { getEventsToRetry } from '@/modules/onboarding/repositories/onboarding.repository';
import {
  existsByStripeEventId,
  createWebhookEvent,
  markWebhookProcessed,
  markWebhookFailed,
} from '@/shared/repositories/stripe.webhook-events.repository';
import { stripe } from '@/shared/utils/stripe-client';
import { addOnboardingWebhookJob } from '@/shared/queue/queue.manager';

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

  // Check if event already exists (idempotency)
  const existingEvent = await existsByStripeEventId(event.id);

  if (existingEvent) {
    return { event, alreadyProcessed: existingEvent.processed };
  }

  // Store new webhook event
  const createdWebhook = await createWebhookEvent(event, headers, url);

  return { event, alreadyProcessed: false, webhookId: createdWebhook.id };
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


export const processEvent = async (eventId: string): Promise<void> => {
  const webhookEvent = await existsByStripeEventId(eventId);

  if (!webhookEvent) {
    console.error(`Webhook event not found: ${eventId}`);
    return;
  }

  if (webhookEvent.processed) {
    console.info(`Webhook event already processed: ${eventId}`);
    return;
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
        console.info(`Unhandled onboarding webhook event type: ${event.type}`);
    }

    // Mark as processed
    await markWebhookProcessed(webhookEvent.id);
    console.info(`Successfully processed webhook event: ${eventId}`);
  } catch (error) {
    const errorMessage
      = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : undefined;

    // Mark as failed (increments retry count, sets next retry time)
    await markWebhookFailed(webhookEvent.id, errorMessage, errorStack);

    console.error(
      {
        eventId,
        error: errorMessage,
        stack: errorStack,
      },
      'Failed to process webhook event',
    );

    throw error;
  }
};

const handleAccountUpdatedWebhook = async (
  event: Stripe.Event,
): Promise<void> => {
  const account = event.data.object as Stripe.Account;

  if (!account.id) {
    console.error('Account ID missing from account.updated event');
    return;
  }

  // Use the functional handler directly - no Fastify dependency needed
  await handleAccountUpdated(account);
};

const handleCapabilityUpdatedWebhook = async (
  event: Stripe.Event,
): Promise<void> => {
  const capability = event.data.object as Stripe.Capability;

  if (!capability.account) {
    console.error('Account ID missing from capability.updated event');
    return;
  }

  // Use the functional handler directly - no Fastify dependency needed
  await handleCapabilityUpdated(capability);
};

const handleExternalAccountCreatedWebhook = async (
  event: Stripe.Event,
): Promise<void> => {
  const externalAccount = event.data.object as Stripe.ExternalAccount;

  if (!externalAccount.account) {
    console.error(
      'Account ID missing from account.external_account.created event',
    );
    return;
  }

  // Use the functional handler directly - no Fastify dependency needed
  await handleExternalAccountCreated(externalAccount);
};

const handleExternalAccountUpdatedWebhook = async (
  event: Stripe.Event,
): Promise<void> => {
  const externalAccount = event.data.object as Stripe.ExternalAccount;

  if (!externalAccount.account) {
    console.error(
      'Account ID missing from account.external_account.updated event',
    );
    return;
  }

  // Use the functional handler directly - no Fastify dependency needed
  await handleExternalAccountUpdated(externalAccount);
};

const handleExternalAccountDeletedWebhook = async (
  event: Stripe.Event,
): Promise<void> => {
  const externalAccount = event.data.object as Stripe.ExternalAccount;

  if (!externalAccount.account) {
    console.error(
      'Account ID missing from account.external_account.deleted event',
    );
    return;
  }

  // Use the functional handler directly - no Fastify dependency needed
  await handleExternalAccountDeleted(externalAccount);
};

export const retryFailedWebhooks = async (): Promise<void> => {
  const eventsToRetry = await getEventsToRetry();

  console.info(`Found ${eventsToRetry.length} webhook events to retry`);

  for (const event of eventsToRetry) {
    // Safety check: skip if max retries reached (should be filtered by query but good to be explicit)
    if (event.retryCount >= event.maxRetries) {
      continue;
    }

    try {
      await processEvent(event.stripeEventId);
    } catch (error) {
      console.error(
        {
          eventId: event.stripeEventId,
          retryCount: event.retryCount,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'Failed to retry webhook event',
      );
    }
  }
};

export const processWebhookAsync = async (
  eventId: string,
  webhookId?: string,
  eventType?: string,
): Promise<void> => {
  // Use Graphile Worker for async processing (Production-grade)
  // This matches the platform webhook processing flow
  try {
    // If webhookId or eventType not provided, try to find them
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
      const errorMsg = `❌ Cannot queue webhook job: Missing metadata for ${eventId}`;
      console.error(errorMsg);
      throw new Error(errorMsg);
    }
  } catch (error) {
    console.error(`❌ Failed to queue onboarding webhook job: ${eventId}`, error);
    throw error;
  }
};
