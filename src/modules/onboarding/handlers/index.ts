/**
 * Onboarding Handlers Index
 *
 * Exports all onboarding-related event handlers
 */

import { handleAccountUpdated } from './account-updated.handler';
import { handleCapabilityUpdated } from './capability-updated.handler';
import { handleExternalAccountCreated } from './external-account-created.handler';
import { handleExternalAccountDeleted } from './external-account-deleted.handler';
import { handleExternalAccountUpdated } from './external-account-updated.handler';

// Internal/Lifecycle Handlers
import {
  handleAccountUpdatedInternal,
  handleAccountRequirementsChanged,
  handleCapabilitiesUpdatedInternal,
  handleExternalAccountCreatedInternal,
  handleExternalAccountUpdatedInternal,
  handleExternalAccountDeletedInternal,
} from './internal-events.handler';
import { handleOnboardingCompleted } from './onboarding-completed.handler';
import { handleOnboardingFailed } from './onboarding-failed.handler';
import { handleOnboardingStarted } from './onboarding-started.handler';
import {
  handleWebhookReceived,
  handleWebhookProcessed,
  handleWebhookFailed,
} from './webhook-events.handler';

const onboardingHandlers = {
  // Stripe Webhook Handlers
  handleAccountUpdated,
  handleCapabilityUpdated,
  handleExternalAccountCreated,
  handleExternalAccountUpdated,
  handleExternalAccountDeleted,

  // Internal Event Handlers
  handleOnboardingStarted,
  handleOnboardingCompleted,
  handleOnboardingFailed,
  handleWebhookReceived,
  handleWebhookProcessed,
  handleWebhookFailed,
  handleAccountUpdatedInternal,
  handleAccountRequirementsChanged,
  handleCapabilitiesUpdatedInternal,
  handleExternalAccountCreatedInternal,
  handleExternalAccountUpdatedInternal,
  handleExternalAccountDeletedInternal,
};

export default onboardingHandlers;
