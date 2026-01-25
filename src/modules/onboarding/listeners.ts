/**
 * Onboarding Module Event Listeners
 *
 * Handles Stripe Connect onboarding-related events.
 */

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
  Event.listen(OnboardingStarted, async (payload) => {
    await handleOnboardingStarted({
      eventId: '',
      type: OnboardingStarted.type,
      eventVersion: '1.0.0',
      timestamp: new Date(),
      actorId: '',
      actorType: 'user',
      organizationId: payload.organization_id,
      payload,
      metadata: { source: 'api', environment: '' },
    });
  });

  Event.listen(OnboardingCompleted, async (payload) => {
    await handleOnboardingCompleted({
      eventId: '',
      type: OnboardingCompleted.type,
      eventVersion: '1.0.0',
      timestamp: new Date(),
      actorId: '',
      actorType: 'user',
      organizationId: payload.organization_id,
      payload,
      metadata: { source: 'api', environment: '' },
    });
  });

  Event.listen(OnboardingFailed, async (payload) => {
    await handleOnboardingFailed({
      eventId: '',
      type: OnboardingFailed.type,
      eventVersion: '1.0.0',
      timestamp: new Date(),
      actorId: '',
      actorType: 'user',
      organizationId: payload.organization_id,
      payload,
      metadata: { source: 'api', environment: '' },
    });
  });

  // Stripe Connect account events
  Event.listen(OnboardingAccountUpdated, async (payload) => {
    await handleAccountUpdatedInternal({
      eventId: '',
      type: OnboardingAccountUpdated.type,
      eventVersion: '1.0.0',
      timestamp: new Date(),
      actorId: '',
      actorType: 'webhook',
      payload,
      metadata: { source: 'webhook', environment: '' },
    });
  });

  Event.listen(OnboardingAccountRequirementsChanged, async (payload) => {
    await handleAccountRequirementsChanged({
      eventId: '',
      type: OnboardingAccountRequirementsChanged.type,
      eventVersion: '1.0.0',
      timestamp: new Date(),
      actorId: '',
      actorType: 'webhook',
      payload,
      metadata: { source: 'webhook', environment: '' },
    });
  });

  Event.listen(OnboardingAccountCapabilitiesUpdated, async (payload) => {
    await handleCapabilitiesUpdatedInternal({
      eventId: '',
      type: OnboardingAccountCapabilitiesUpdated.type,
      eventVersion: '1.0.0',
      timestamp: new Date(),
      actorId: '',
      actorType: 'webhook',
      payload,
      metadata: { source: 'webhook', environment: '' },
    });
  });

  // External account events
  Event.listen(OnboardingExternalAccountCreated, async (payload) => {
    await handleExternalAccountCreatedInternal({
      eventId: '',
      type: OnboardingExternalAccountCreated.type,
      eventVersion: '1.0.0',
      timestamp: new Date(),
      actorId: '',
      actorType: 'webhook',
      payload,
      metadata: { source: 'webhook', environment: '' },
    });
  });

  Event.listen(OnboardingExternalAccountUpdated, async (payload) => {
    await handleExternalAccountUpdatedInternal({
      eventId: '',
      type: OnboardingExternalAccountUpdated.type,
      eventVersion: '1.0.0',
      timestamp: new Date(),
      actorId: '',
      actorType: 'webhook',
      payload,
      metadata: { source: 'webhook', environment: '' },
    });
  });

  Event.listen(OnboardingExternalAccountDeleted, async (payload) => {
    await handleExternalAccountDeletedInternal({
      eventId: '',
      type: OnboardingExternalAccountDeleted.type,
      eventVersion: '1.0.0',
      timestamp: new Date(),
      actorId: '',
      actorType: 'webhook',
      payload,
      metadata: { source: 'webhook', environment: '' },
    });
  });

  // Webhook processing events
  Event.listen(OnboardingWebhookReceived, async (payload) => {
    await handleWebhookReceived({
      eventId: '',
      type: OnboardingWebhookReceived.type,
      eventVersion: '1.0.0',
      timestamp: new Date(),
      actorId: '',
      actorType: 'webhook',
      payload,
      metadata: { source: 'webhook', environment: '' },
    });
  });

  Event.listen(OnboardingWebhookProcessed, async (payload) => {
    await handleWebhookProcessed({
      eventId: '',
      type: OnboardingWebhookProcessed.type,
      eventVersion: '1.0.0',
      timestamp: new Date(),
      actorId: '',
      actorType: 'webhook',
      payload,
      metadata: { source: 'webhook', environment: '' },
    });
  });

  Event.listen(OnboardingWebhookFailed, async (payload) => {
    await handleWebhookFailed({
      eventId: '',
      type: OnboardingWebhookFailed.type,
      eventVersion: '1.0.0',
      timestamp: new Date(),
      actorId: '',
      actorType: 'webhook',
      payload,
      metadata: { source: 'webhook', environment: '' },
    });
  });

  logger.info('Onboarding event listeners registered');
}
