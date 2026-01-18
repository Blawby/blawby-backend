/**
 * Onboarding Event Handlers
 *
 * Registers handlers for onboarding-related events.
 * These events track the Stripe Connect onboarding flow for organizations.
 */

import { getLogger } from '@logtape/logtape';
import { EventType } from '@/shared/events/enums/event-types';
import { subscribeToEvent } from '@/shared/events/event-consumer';
import onboardingHandlers from '@/modules/onboarding/handlers';

const logger = getLogger(['onboarding', 'events']);

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
 * Register all onboarding event handlers
 */
export const registerOnboardingEvents = (): void => {
  logger.info('Registering onboarding event handlers...');

  // Onboarding lifecycle events
  subscribeToEvent(EventType.ONBOARDING_STARTED, handleOnboardingStarted);
  subscribeToEvent(EventType.ONBOARDING_COMPLETED, handleOnboardingCompleted);
  subscribeToEvent(EventType.ONBOARDING_FAILED, handleOnboardingFailed);

  // Stripe Connect account events (internal side)
  subscribeToEvent(EventType.ONBOARDING_ACCOUNT_UPDATED, handleAccountUpdatedInternal);
  subscribeToEvent(EventType.ONBOARDING_ACCOUNT_REQUIREMENTS_CHANGED, handleAccountRequirementsChanged);
  subscribeToEvent(EventType.ONBOARDING_ACCOUNT_CAPABILITIES_UPDATED, handleCapabilitiesUpdatedInternal);

  // External account events (internal side)
  subscribeToEvent(EventType.ONBOARDING_EXTERNAL_ACCOUNT_CREATED, handleExternalAccountCreatedInternal);
  subscribeToEvent(EventType.ONBOARDING_EXTERNAL_ACCOUNT_UPDATED, handleExternalAccountUpdatedInternal);
  subscribeToEvent(EventType.ONBOARDING_EXTERNAL_ACCOUNT_DELETED, handleExternalAccountDeletedInternal);

  // Webhook processing events
  subscribeToEvent(EventType.ONBOARDING_WEBHOOK_RECEIVED, handleWebhookReceived);
  subscribeToEvent(EventType.ONBOARDING_WEBHOOK_PROCESSED, handleWebhookProcessed);
  subscribeToEvent(EventType.ONBOARDING_WEBHOOK_FAILED, handleWebhookFailed);

  logger.info('✅ Onboarding event handlers registered successfully');
};
