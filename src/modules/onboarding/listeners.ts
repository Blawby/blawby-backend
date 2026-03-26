/**
 * Onboarding Module Event Listeners
 *
 * Handles Stripe Connect onboarding-related events.
 */

import crypto from 'node:crypto';
import { getLogger } from '@logtape/logtape';
import onboardingHandlers from '@/modules/onboarding/handlers';
import {
  OnboardingStarted,
  OnboardingCompleted,
  OnboardingFailed,
  OnboardingAccountUpdated,
  OnboardingAccountRequirementsChanged,
  OnboardingAccountCapabilitiesUpdated,
  OnboardingExternalAccountCreated,
  OnboardingExternalAccountUpdated,
  OnboardingExternalAccountDeleted,
  OnboardingWebhookReceived,
  OnboardingWebhookProcessed,
  OnboardingWebhookFailed,
} from '@/shared/events/definitions';
import { Event } from '@/shared/events/event';
import { getAppEnv } from '@/shared/utils/env';

const logger = getLogger(['onboarding', 'listeners']);

const {
  handleOnboardingStarted,
  handleOnboardingCompleted,
  handleOnboardingFailed,
  handleAccountUpdatedInternal,
  handleAccountRequirementsChanged,
  handleCapabilitiesUpdatedInternal,
  handleExternalAccountCreatedInternal,
  handleExternalAccountUpdatedInternal,
  handleExternalAccountDeletedInternal,
  handleWebhookReceived,
  handleWebhookProcessed,
  handleWebhookFailed,
} = onboardingHandlers;

/**
 * Register all onboarding event listeners
 */
export function registerOnboardingListeners(): void {
  logger.info('Registering onboarding event listeners...');

  // Onboarding lifecycle events
  Event.listen(OnboardingStarted, async (payload, context) => {
    await handleOnboardingStarted({
      eventId: crypto.randomUUID(),
      type: OnboardingStarted.type,
      eventVersion: '1.0.0',
      createdAt: new Date(),
      actorId: context?.actorId ?? 'system',
      actorType: 'user',
      organizationId: payload.organization_id,
      payload,
      metadata: { source: 'api', environment: getAppEnv() },
    });
  });

  Event.listen(OnboardingCompleted, async (payload, context) => {
    await handleOnboardingCompleted({
      eventId: crypto.randomUUID(),
      type: OnboardingCompleted.type,
      eventVersion: '1.0.0',
      createdAt: new Date(),
      actorId: context?.actorId ?? 'system',
      actorType: 'user',
      organizationId: payload.organization_id,
      payload,
      metadata: { source: 'api', environment: getAppEnv() },
    });
  });

  Event.listen(OnboardingFailed, async (payload, context) => {
    await handleOnboardingFailed({
      eventId: crypto.randomUUID(),
      type: OnboardingFailed.type,
      eventVersion: '1.0.0',
      createdAt: new Date(),
      actorId: context?.actorId ?? 'system',
      actorType: 'user',
      organizationId: payload.organization_id,
      payload,
      metadata: { source: 'api', environment: getAppEnv() },
    });
  });

  // Stripe Connect account events
  Event.listen(OnboardingAccountUpdated, async (payload, context) => {
    await handleAccountUpdatedInternal({
      eventId: crypto.randomUUID(),
      type: OnboardingAccountUpdated.type,
      eventVersion: '1.0.0',
      createdAt: new Date(),
      actorId: context?.actorId ?? 'system',
      actorType: 'webhook',
      payload,
      metadata: { source: 'webhook', environment: getAppEnv() },
    });
  });

  Event.listen(OnboardingAccountRequirementsChanged, async (payload, context) => {
    await handleAccountRequirementsChanged({
      eventId: crypto.randomUUID(),
      type: OnboardingAccountRequirementsChanged.type,
      eventVersion: '1.0.0',
      createdAt: new Date(),
      actorId: context?.actorId ?? 'system',
      actorType: 'webhook',
      payload,
      metadata: { source: 'webhook', environment: getAppEnv() },
    });
  });

  Event.listen(OnboardingAccountCapabilitiesUpdated, async (payload, context) => {
    await handleCapabilitiesUpdatedInternal({
      eventId: crypto.randomUUID(),
      type: OnboardingAccountCapabilitiesUpdated.type,
      eventVersion: '1.0.0',
      createdAt: new Date(),
      actorId: context?.actorId ?? 'system',
      actorType: 'webhook',
      payload,
      metadata: { source: 'webhook', environment: getAppEnv() },
    });
  });

  // External account events
  Event.listen(OnboardingExternalAccountCreated, async (payload, context) => {
    await handleExternalAccountCreatedInternal({
      eventId: crypto.randomUUID(),
      type: OnboardingExternalAccountCreated.type,
      eventVersion: '1.0.0',
      createdAt: new Date(),
      actorId: context?.actorId ?? 'system',
      actorType: 'webhook',
      payload,
      metadata: { source: 'webhook', environment: getAppEnv() },
    });
  });

  Event.listen(OnboardingExternalAccountUpdated, async (payload, context) => {
    await handleExternalAccountUpdatedInternal({
      eventId: crypto.randomUUID(),
      type: OnboardingExternalAccountUpdated.type,
      eventVersion: '1.0.0',
      createdAt: new Date(),
      actorId: context?.actorId ?? 'system',
      actorType: 'webhook',
      payload,
      metadata: { source: 'webhook', environment: getAppEnv() },
    });
  });

  Event.listen(OnboardingExternalAccountDeleted, async (payload, context) => {
    await handleExternalAccountDeletedInternal({
      eventId: crypto.randomUUID(),
      type: OnboardingExternalAccountDeleted.type,
      eventVersion: '1.0.0',
      createdAt: new Date(),
      actorId: context?.actorId ?? 'system',
      actorType: 'webhook',
      payload,
      metadata: { source: 'webhook', environment: getAppEnv() },
    });
  });

  // Webhook processing events
  Event.listen(OnboardingWebhookReceived, async (payload, context) => {
    await handleWebhookReceived({
      eventId: crypto.randomUUID(),
      type: OnboardingWebhookReceived.type,
      eventVersion: '1.0.0',
      createdAt: new Date(),
      actorId: context?.actorId ?? 'system',
      actorType: 'webhook',
      payload,
      metadata: { source: 'webhook', environment: getAppEnv() },
    });
  });

  Event.listen(OnboardingWebhookProcessed, async (payload, context) => {
    await handleWebhookProcessed({
      eventId: crypto.randomUUID(),
      type: OnboardingWebhookProcessed.type,
      eventVersion: '1.0.0',
      createdAt: new Date(),
      actorId: context?.actorId ?? 'system',
      actorType: 'webhook',
      payload,
      metadata: { source: 'webhook', environment: getAppEnv() },
    });
  });

  Event.listen(OnboardingWebhookFailed, async (payload, context) => {
    await handleWebhookFailed({
      eventId: crypto.randomUUID(),
      type: OnboardingWebhookFailed.type,
      eventVersion: '1.0.0',
      createdAt: new Date(),
      actorId: context?.actorId ?? 'system',
      actorType: 'webhook',
      payload,
      metadata: { source: 'webhook', environment: getAppEnv() },
    });
  });

  logger.info('Onboarding event listeners registered');
}
