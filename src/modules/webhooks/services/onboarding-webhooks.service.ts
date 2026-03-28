/**
 * Onboarding Webhooks Service
 *
 * Handles processing of Stripe webhook events related to onboarding and account setup.
 * Uses the onboarding_webhook_events table for storage and processing.
 * Focuses on account updates, capabilities, and external account management.
 */

import { getLogger } from '@logtape/logtape';
import type { Stripe } from 'stripe';
import type { Result } from '@/shared/types/result';
import { ok, internalError, badRequest } from '@/shared/utils/result';
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
  ): Promise<
    Result<{
      event: Stripe.Event;
      alreadyProcessed: boolean;
      webhookId?: string;
    }>
  > {
    if (!webhookSecret) {
      logger.error('Webhook secret is required but missing');
      return internalError('Webhook secret is required');
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
      return badRequest('Invalid signature');
    }

    // Atomic verify and store
    const webhookEvent = await stripeWebhookEventsRepository.createIfNotExists(event, headers, url);

    if (!webhookEvent) {
      // Check if it already exists to determine processing status
      const existing = await stripeWebhookEventsRepository.existsByStripeEventId(event.id);
      logger.info('Webhook event already exists, skipping storage', { eventId: event.id });
      return ok({ event, alreadyProcessed: existing?.processed ?? true });
    }

    return ok({ event, alreadyProcessed: false, webhookId: webhookEvent.id });
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
  ): Promise<
    Result<{
      event: Stripe.Event;
      alreadyProcessed: boolean;
      webhookId?: string;
    }>
  > {
    const webhookSecret = config.stripe.connectWebhookSecret;

    if (!webhookSecret) {
      logger.error('STRIPE_CONNECT_WEBHOOK_SECRET environment variable is missing');
      return internalError('Stripe configuration error');
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
  ): Promise<
    Result<{
      event: Stripe.Event;
      alreadyProcessed: boolean;
      webhookId?: string;
    }>
  > {
    const webhookSecret = config.stripe.webhookSecret;

    if (!webhookSecret) {
      logger.error('STRIPE_WEBHOOK_SECRET environment variable is missing');
      return internalError('Stripe configuration error');
    }

    return this.verifyAndStoreWithSecret(rawBody, signature, headers, url, webhookSecret);
  },

  /**
   * Process an onboarding webhook event
   */
  async processEvent(eventId: string): Promise<Result<void>> {
    let webhookEvent: Awaited<ReturnType<typeof stripeWebhookEventsRepository.existsByStripeEventId>> | null = null;

    try {
      webhookEvent = await stripeWebhookEventsRepository.existsByStripeEventId(eventId);

      if (!webhookEvent) {
        logger.error('Webhook event not found in database: {eventId}', { eventId });
        return ok(undefined);
      }

      if (webhookEvent.processed) {
        logger.info('Webhook event already marked as processed: {eventId}', { eventId });
        return ok(undefined);
      }

      const event = webhookEvent.payload;

      if (!isStripeEvent(event)) {
        logger.error('Stored webhook payload is not a valid Stripe event: {eventId}', { eventId: webhookEvent.id });
        return internalError('Stored webhook payload is invalid');
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
      return ok(undefined);
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

      return internalError(errorMessage);
    }
  },

  /**
   * Handle account.updated event
   */
  async handleAccountUpdatedWebhook(event: Stripe.Event): Promise<void> {
    const account = event.data.object;

    if (!isStripeAccount(account)) {
      logger.error('Invalid account object in account.updated event: {eventId}', { eventId: event.id });
      return;
    }

    if (!account.id) {
      logger.error('Account ID missing from account.updated event: {eventId}', { eventId: event.id });
      return;
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
      return;
    }

    if (!capability.account) {
      logger.error('Account ID missing from capability.updated event: {eventId}', { eventId: event.id });
      return;
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
      return;
    }

    if (!externalAccount.account) {
      logger.error('Account ID missing from account.external_account.created event: {eventId}', { eventId: event.id });
      return;
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
      return;
    }

    if (!externalAccount.account) {
      logger.error('Account ID missing from account.external_account.updated event: {eventId}', { eventId: event.id });
      return;
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
      return;
    }

    if (!externalAccount.account) {
      logger.error('Account ID missing from account.external_account.deleted event: {eventId}', { eventId: event.id });
      return;
    }

    await handleExternalAccountDeleted(externalAccount);
  },

  /**
   * Retry failed webhooks
   */
  async retryFailedWebhooks(): Promise<void> {
    const eventsToRetry = await getEventsToRetry();

    if (eventsToRetry.length > 0) {
      logger.info('Found {count} webhook events to retry', { count: eventsToRetry.length });
    }

    const retryPromises = eventsToRetry
      .filter((event) => event.retryCount < event.maxRetries)
      .map(async (event) => {
        try {
          await this.processEvent(event.stripeEventId);
        } catch (error) {
          logger.error('Failed to retry onboarding webhook event {stripeEventId}: {error}', {
            stripeEventId: event.stripeEventId,
            retryCount: event.retryCount,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      });

    await Promise.all(retryPromises);
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
        const errorMsg = `Cannot queue onboarding webhook job: Missing metadata for ${eventId}`;
        logger.error(errorMsg);
        throw new Error(errorMsg);
      }
    } catch (error) {
      logger.error('Failed to queue onboarding webhook job for {eventId}: {error}', {
        eventId,
        error,
      });
      throw error;
    }
  },
};

export default onboardingWebhooksService;
