/**
 * Onboarding Handlers Index
 *
 * Exports all onboarding-related event handlers
 */

import { handleOnboardingCompleted } from './onboarding-completed.handler';
import { handleAccountUpdated } from './account-updated.handler';
import { handleCapabilityUpdated } from './capability-updated.handler';
import { handleExternalAccountCreated } from './external-account-created.handler';
import { handleExternalAccountUpdated } from './external-account-updated.handler';
import { handleExternalAccountDeleted } from './external-account-deleted.handler';

// Internal/Lifecycle Handlers
import { handleOnboardingStarted } from './onboarding-started.handler';
import { handleOnboardingFailed } from './onboarding-failed.handler';
import {
  handleWebhookReceived,
  handleWebhookProcessed,
  handleWebhookFailed,
} from './webhook-events.handler';
import {
  handleAccountUpdatedInternal,
  handleAccountRequirementsChanged,
  handleCapabilitiesUpdatedInternal,
  handleExternalAccountCreatedInternal,
  handleExternalAccountUpdatedInternal,
  handleExternalAccountDeletedInternal,
} from './internal-events.handler';

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
