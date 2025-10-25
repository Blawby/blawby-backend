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
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    throw new Error('STRIPE_WEBHOOK_SECRET environment variable is required');
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
    throw new Error('Invalid signature');
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

export const processWebhookAsync = async (eventId: string): Promise<void> => {
  // Use setImmediate for async processing (Phase 1 - acceptable for current scale)
  // Future enhancement: Replace with proper job queue in Phase 2 for better scalability
  setImmediate(async () => {
    try {
      await processEvent(eventId);
    } catch (error) {
      console.error(
        {
          eventId,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'Async webhook processing failed',
      );
    }
  });
};
