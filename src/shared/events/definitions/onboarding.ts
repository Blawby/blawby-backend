import { BaseEvent } from '@/shared/events/event';

// ═══════════════════════════════════════════════════════════════════════════
// ONBOARDING EVENTS
// ═══════════════════════════════════════════════════════════════════════════

export class OnboardingStarted extends BaseEvent<{
  organization_id: string;
  organization_email: string;
  account_id: string;
  session_id: string;
}> {
  static type = 'onboarding.started' as const;
}

export class OnboardingCompleted extends BaseEvent<{
  organization_id: string;
  stripe_account_id: string;
  charges_enabled: boolean;
  payouts_enabled: boolean;
}> {
  static type = 'onboarding.completed' as const;
}

export class OnboardingCompletedProcessed extends BaseEvent<Record<string, unknown>> {
  static type = 'onboarding.completed_processed' as const;
}

export class OnboardingFailed extends BaseEvent<{
  organization_id: string;
  error: string;
}> {
  static type = 'onboarding.failed' as const;
}

export class OnboardingAccountUpdated extends BaseEvent<Record<string, unknown>> {
  static type = 'onboarding.account_updated' as const;
}

export class OnboardingAccountRequirementsChanged extends BaseEvent<Record<string, unknown>> {
  static type = 'onboarding.account_requirements_changed' as const;
}

export class OnboardingAccountCapabilitiesUpdated extends BaseEvent<Record<string, unknown>> {
  static type = 'onboarding.account_capabilities_updated' as const;
}

export class OnboardingExternalAccountCreated extends BaseEvent<Record<string, unknown>> {
  static type = 'onboarding.external_account_created' as const;
}

export class OnboardingExternalAccountUpdated extends BaseEvent<Record<string, unknown>> {
  static type = 'onboarding.external_account_updated' as const;
}

export class OnboardingExternalAccountDeleted extends BaseEvent<Record<string, unknown>> {
  static type = 'onboarding.external_account_deleted' as const;
}

export class OnboardingWebhookReceived extends BaseEvent<Record<string, unknown>> {
  static type = 'onboarding.webhook_received' as const;
}

export class OnboardingWebhookProcessed extends BaseEvent<Record<string, unknown>> {
  static type = 'onboarding.webhook_processed' as const;
}

export class OnboardingWebhookFailed extends BaseEvent<Record<string, unknown>> {
  static type = 'onboarding.webhook_failed' as const;
}
