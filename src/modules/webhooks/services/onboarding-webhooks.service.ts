/**
 * Onboarding Webhooks Service
 *
 * Handles processing of Stripe webhook events related to onboarding and account setup.
 * Uses the onboarding_webhook_events table for storage and processing.
 * Focuses on account updates, capabilities, and external account management.
 */

import { getLogger } from '@logtape/logtape';
import type { Stripe } from 'stripe';
import {
  isStripeAccount,
  isStripeCapability,
  isStripeEvent,
  isStripeExternalAccount,
} from '@/shared/utils/stripeGuards';
import onboardingHandlers from '@/modules/onboarding/handlers/index';
import { getEventsToRetry } from '@/modules/onboarding/database/queries/onboarding.repository';
import { config } from '@/shared/config';
import { stripeWebhookEventsRepository } from '@/shared/repositories/stripe.webhook-events.repository';
import { stripe } from '@/shared/utils/stripe-client';
import { addOnboardingWebhookJob } from '@/shared/queue/queue.manager';

const logger = getLogger(['onboarding', 'webhook-service']);

export class WebhookVerificationError extends Error {
  constructor(
    message: string,
    public readonly status: 400 | 500
  ) {
    super(message);
    this.name = 'WebhookVerificationError';
  }
}

export interface StoredWebhookVerificationResult {
  event: Stripe.Event;
  alreadyProcessed: boolean;
  webhookId?: string;
}

const {
  handleAccountUpdated,
  handleCapabilityUpdated,
  handleExternalAccountCreated,
  handleExternalAccountUpdated,
  handleExternalAccountDeleted,
} = onboardingHandlers;

export const onboardingWebhooksService = {
  /**
   * Generic webhook verification and storage function
   * Accepts a webhook secret to support different webhook endpoints
   */
  async verifyAndStoreWithSecret(
    rawBody: string | Buffer,
    signature: string,
    headers: Record<string, string>,
    url: string,
    webhookSecret: string
  ): Promise<StoredWebhookVerificationResult> {
    if (!webhookSecret) {
      logger.error('Webhook secret is required but missing');
      throw new WebhookVerificationError('Webhook secret is required', 500);
    }

    // Verify signature using Stripe SDK
    let event: Stripe.Event | undefined = undefined;
    try {
      logger.info('Verifying webhook signature', {
        secretPresent: true,
      });
      event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    } catch (err) {
      logger.warn('Invalid webhook signature received', { error: err instanceof Error ? err.message : 'Unknown' });
      throw new WebhookVerificationError('Invalid signature', 400);
    }

    // Atomic verify and store
    const webhookEvent = await stripeWebhookEventsRepository.createIfNotExists(event, headers, url);

    if (!webhookEvent) {
      // Check if it already exists to determine processing status
      const existing = await stripeWebhookEventsRepository.existsByStripeEventId(event.id);
      logger.info('Webhook event already exists, skipping storage', { eventId: event.id });
      return { event, alreadyProcessed: existing?.processed ?? true };
    }

    return { event, alreadyProcessed: false, webhookId: webhookEvent.id };
  },

  /**
   * Verify and store Connect webhook (for onboarding/connected accounts)
   * Uses STRIPE_CONNECT_WEBHOOK_SECRET
   */
  async verifyAndStore(
    rawBody: string | Buffer,
    signature: string,
    headers: Record<string, string>,
    url: string
  ): Promise<StoredWebhookVerificationResult> {
    const webhookSecret = config.stripe.connectWebhookSecret;

    if (!webhookSecret) {
      logger.error('STRIPE_CONNECT_WEBHOOK_SECRET environment variable is missing');
      throw new WebhookVerificationError('Stripe configuration error', 500);
    }

    return this.verifyAndStoreWithSecret(rawBody, signature, headers, url, webhookSecret);
  },

  /**
   * Verify and store main Stripe webhook (for payments, invoices, etc.)
   * Uses STRIPE_WEBHOOK_SECRET
   */
  async verifyAndStoreAccount(
    rawBody: string | Buffer,
    signature: string,
    headers: Record<string, string>,
    url: string
  ): Promise<StoredWebhookVerificationResult> {
    const { webhookSecret } = config.stripe;

    if (!webhookSecret) {
      logger.error('STRIPE_WEBHOOK_SECRET environment variable is missing');
      throw new WebhookVerificationError('Stripe configuration error', 500);
    }

    return this.verifyAndStoreWithSecret(rawBody, signature, headers, url, webhookSecret);
  },

  /**
   * Process an onboarding webhook event
   */
  async processEvent(eventId: string): Promise<void> {
    let webhookEvent: Awaited<ReturnType<typeof stripeWebhookEventsRepository.existsByStripeEventId>> | null = null;

    try {
      webhookEvent = await stripeWebhookEventsRepository.existsByStripeEventId(eventId);

      if (!webhookEvent) {
        logger.error('Webhook event not found in database: {eventId}', { eventId });
        return;
      }

      if (webhookEvent.processed) {
        logger.info('Webhook event already marked as processed: {eventId}', { eventId });
        return;
      }

      const event = webhookEvent.payload;

      if (!isStripeEvent(event)) {
        await stripeWebhookEventsRepository.markFailed(
          webhookEvent.id,
          'Stored webhook payload is not a valid Stripe event'
        );
        logger.error('Stored webhook payload is not a valid Stripe event: {eventId}', { eventId: webhookEvent.id });
        throw new Error('Stored webhook payload is invalid');
      }

      // Process based on event type - onboarding related events only
      switch (event.type) {
        case 'account.updated':
          await this.handleAccountUpdatedWebhook(event);
          break;

        case 'capability.updated':
          await this.handleCapabilityUpdatedWebhook(event);
          break;

        case 'account.external_account.created':
          await this.handleExternalAccountCreatedWebhook(event);
          break;

        case 'account.external_account.updated':
          await this.handleExternalAccountUpdatedWebhook(event);
          break;

        case 'account.external_account.deleted':
          await this.handleExternalAccountDeletedWebhook(event);
          break;

        default:
          logger.info('Unhandled onboarding webhook event type: {eventType}', { eventType: event.type });
      }

      // Mark as processed
      await stripeWebhookEventsRepository.markProcessed(webhookEvent.id);
      logger.info('Successfully processed onboarding webhook event: {eventId} ({eventType})', {
        eventId,
        eventType: event.type,
      });
      return;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;

      // Mark as failed (increments retry count, sets next retry time)
      if (webhookEvent) {
        await stripeWebhookEventsRepository.markFailed(webhookEvent.id, errorMessage, errorStack);
      }

      logger.error('Failed to process onboarding webhook event {eventId}: {error}', {
        eventId,
        error: errorMessage,
        stack: errorStack,
      });

      throw error instanceof Error ? error : new Error(errorMessage);
    }
  },

  /**
   * Handle account.updated event
   */
  async handleAccountUpdatedWebhook(event: Stripe.Event): Promise<void> {
    const account = event.data.object;

    if (!isStripeAccount(account)) {
      logger.error('Invalid account object in account.updated event: {eventId}', { eventId: event.id });
      throw new Error('Invalid account object in account.updated event');
    }

    if (!account.id) {
      logger.error('Account ID missing from account.updated event: {eventId}', { eventId: event.id });
      throw new Error('Account ID missing from account.updated event');
    }

    await handleAccountUpdated(account);
  },

  /**
   * Handle capability.updated event
   */
  async handleCapabilityUpdatedWebhook(event: Stripe.Event): Promise<void> {
    const capability = event.data.object;

    if (!isStripeCapability(capability)) {
      logger.error('Invalid capability object in capability.updated event: {eventId}', { eventId: event.id });
      throw new Error('Invalid capability object in capability.updated event');
    }

    if (!capability.account) {
      logger.error('Account ID missing from capability.updated event: {eventId}', { eventId: event.id });
      throw new Error('Account ID missing from capability.updated event');
    }

    await handleCapabilityUpdated(capability);
  },

  /**
   * Handle account.external_account.created event
   */
  async handleExternalAccountCreatedWebhook(event: Stripe.Event): Promise<void> {
    const externalAccount = event.data.object;

    if (!isStripeExternalAccount(externalAccount)) {
      logger.error('Invalid external account object in account.external_account.created event: {eventId}', {
        eventId: event.id,
      });
      throw new Error('Invalid external account object in account.external_account.created event');
    }

    if (!externalAccount.account) {
      logger.error('Account ID missing from account.external_account.created event: {eventId}', { eventId: event.id });
      throw new Error('Account ID missing from account.external_account.created event');
    }

    await handleExternalAccountCreated(externalAccount);
  },

  /**
   * Handle account.external_account.updated event
   */
  async handleExternalAccountUpdatedWebhook(event: Stripe.Event): Promise<void> {
    const externalAccount = event.data.object;

    if (!isStripeExternalAccount(externalAccount)) {
      logger.error('Invalid external account object in account.external_account.updated event: {eventId}', {
        eventId: event.id,
      });
      throw new Error('Invalid external account object in account.external_account.updated event');
    }

    if (!externalAccount.account) {
      logger.error('Account ID missing from account.external_account.updated event: {eventId}', { eventId: event.id });
      throw new Error('Account ID missing from account.external_account.updated event');
    }

    await handleExternalAccountUpdated(externalAccount);
  },

  /**
   * Handle account.external_account.deleted event
   */
  async handleExternalAccountDeletedWebhook(event: Stripe.Event): Promise<void> {
    const externalAccount = event.data.object;

    if (!isStripeExternalAccount(externalAccount)) {
      logger.error('Invalid external account object in account.external_account.deleted event: {eventId}', {
        eventId: event.id,
      });
      throw new Error('Invalid external account object in account.external_account.deleted event');
    }

    if (!externalAccount.account) {
      logger.error('Account ID missing from account.external_account.deleted event: {eventId}', { eventId: event.id });
      throw new Error('Account ID missing from account.external_account.deleted event');
    }

    await handleExternalAccountDeleted(externalAccount);
  },

  /**
   * Retry failed webhooks
   */
  async retryFailedWebhooks(): Promise<void> {
    const eventsToRetry = await getEventsToRetry();
    const retryableEvents = eventsToRetry.filter((event) => event.retryCount < event.maxRetries);

    if (retryableEvents.length > 0) {
      logger.info('Found {count} webhook events to retry', { count: retryableEvents.length });
    }

    for (const event of retryableEvents) {
      try {
        await this.processEvent(event.stripeEventId);
      } catch (error) {
        logger.error('Failed to retry onboarding webhook event {stripeEventId}: {error}', {
          stripeEventId: event.stripeEventId,
          retryCount: event.retryCount,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  },

  /**
   * Queue a webhook event for asynchronous processing
   */
  async processWebhookAsync(eventId: string, webhookId?: string, eventType?: string): Promise<void> {
    try {
      let wId = webhookId;
      let type = eventType;

      if (!wId || !type) {
        const webhookEvent = await stripeWebhookEventsRepository.existsByStripeEventId(eventId);
        if (webhookEvent) {
          wId = webhookEvent.id;
          type = webhookEvent.eventType;
        }
      }

      if (wId && type) {
        await addOnboardingWebhookJob(wId, eventId, type);
      } else {
        logger.error('Cannot queue onboarding webhook job due to missing metadata for {eventId}', {
          eventId,
        });
        return;
      }
    } catch (error) {
      logger.error('Failed to queue onboarding webhook job for {eventId}: {error}', {
        eventId,
        error,
      });
    }
  },
};

export default onboardingWebhooksService;
