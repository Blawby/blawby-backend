/**
 * Event Definitions Aggregator
 *
 * Centralized place for all event classes. This file re-exports domain-specific
 * definitions to maintain a single import point while keeping the code base modular.
 *
 * Usage:
 *   import { ClientCreated } from '@/shared/events/definitions';
 */

import {
  AuthAccountDeleted,
  AuthEmailVerified,
  AuthPasswordChanged,
  AuthPasswordResetRequested,
  AuthUserLoggedIn,
  AuthUserLoggedOut,
  AuthUserSignedUp,
  InvitationAccepted,
} from '@/shared/events/definitions/auth';
import { ClientCreated, ClientDeleted, ClientStatusChanged, ClientUpdated } from '@/shared/events/definitions/client';
import {
  ConflictCheckCompleted,
  EngagementContractAccepted,
  EngagementContractCreated,
  EngagementContractDeclined,
  EngagementContractSent,
} from '@/shared/events/definitions/engagement-contracts';
import { IntakeSubmitted, IntakeTriaged } from '@/shared/events/definitions/intakes';
import {
  InvoiceCreated,
  InvoiceDeleted,
  InvoicePaid,
  InvoicePaymentFailed,
  InvoiceRefunded,
  InvoiceSent,
  InvoiceUpdated,
  InvoiceVoided,
} from '@/shared/events/definitions/invoices';
import { KrabiClawActorAttributed } from '@/shared/events/definitions/krabiclaw';
import { MatterCreated, MatterDeleted, MatterStatusChanged, MatterUpdated } from '@/shared/events/definitions/matters';
import {
  OnboardingAccountCapabilitiesUpdated,
  OnboardingAccountRequirementsChanged,
  OnboardingAccountUpdated,
  OnboardingCompleted,
  OnboardingCompletedProcessed,
  OnboardingExternalAccountCreated,
  OnboardingExternalAccountDeleted,
  OnboardingExternalAccountUpdated,
  OnboardingFailed,
  OnboardingStarted,
  OnboardingWebhookFailed,
  OnboardingWebhookProcessed,
  OnboardingWebhookReceived,
} from '@/shared/events/definitions/onboarding';
import {
  IntakePaymentCanceled,
  IntakePaymentCreated,
  IntakePaymentFailed,
  IntakePaymentSucceeded,
  PaymentCanceled,
  PaymentFailed,
  PaymentReceived,
  PaymentRefunded,
  PaymentSessionCreated,
  PaymentSucceeded,
} from '@/shared/events/definitions/payments';
import {
  PracticeAccessDenied,
  PracticeCreated,
  PracticeDeleted,
  PracticeDetailsCreated,
  PracticeDetailsDeleted,
  PracticeDetailsUpdated,
  PracticeMemberInvited,
  PracticeMemberJoined,
  PracticeSwitched,
  PracticeUpdated,
} from '@/shared/events/definitions/practice';
import {
  PracticeSettingsUpdated,
  SettingsCategoryUpdated,
  SettingsCreated,
  SettingsDeleted,
  SettingsUpdated,
  UserSettingsUpdated,
} from '@/shared/events/definitions/settings';
import {
  StripeConnectedAccountCreated,
  StripeConnectedAccountDeleted,
  StripeConnectedAccountUpdated,
  StripeCustomerCreated,
  StripeCustomerDeleted,
  StripeCustomerSyncFailed,
  StripeCustomerUpdated,
} from '@/shared/events/definitions/stripe';
import {
  SubscriptionCancelled,
  SubscriptionCreated,
  SubscriptionPaymentFailed,
  SubscriptionRenewed,
  SubscriptionUpdated,
} from '@/shared/events/definitions/subscriptions';
import {
  SessionCreated,
  SessionExpired,
  SessionInvalidated,
  SystemErrorOccurred,
  SystemHealthCheckPerformed,
  SystemPerformanceDegraded,
} from '@/shared/events/definitions/system';
import {
  UserAvatarUpdated,
  UserCreated,
  UserDeleted,
  UserEmailChanged,
  UserProfileUpdated,
  UserUpdated,
} from '@/shared/events/definitions/users';

// Re-export everything for backward compatibility
export * from '@/shared/events/definitions/auth';
export * from '@/shared/events/definitions/intakes';
export * from '@/shared/events/definitions/invoices';
export * from '@/shared/events/definitions/krabiclaw';
export * from '@/shared/events/definitions/matters';
export * from '@/shared/events/definitions/onboarding';
export * from '@/shared/events/definitions/payments';
export * from '@/shared/events/definitions/practice';
export * from '@/shared/events/definitions/settings';
export * from '@/shared/events/definitions/stripe';
export * from '@/shared/events/definitions/subscriptions';
export * from '@/shared/events/definitions/system';
export * from '@/shared/events/definitions/client';
export * from '@/shared/events/definitions/engagement-contracts';
export * from '@/shared/events/definitions/users';

/**
 * Map of event type strings to event classes
 * Useful for dynamic event handling and reverse lookup
 */
export const EventClasses = {
  // Stripe Account
  'stripe.connected_account_created': StripeConnectedAccountCreated,
  'stripe.connected_account_updated': StripeConnectedAccountUpdated,
  'stripe.connected_account_deleted': StripeConnectedAccountDeleted,

  // Stripe Customer
  'stripe.customer.created': StripeCustomerCreated,
  'stripe.customer.updated': StripeCustomerUpdated,
  'stripe.customer.deleted': StripeCustomerDeleted,
  'stripe.customer.sync_failed': StripeCustomerSyncFailed,

  // Auth
  'auth.user_signed_up': AuthUserSignedUp,
  'auth.email_verified': AuthEmailVerified,
  'auth.user_logged_in': AuthUserLoggedIn,
  'auth.user_logged_out': AuthUserLoggedOut,
  'auth.password_reset_requested': AuthPasswordResetRequested,
  'auth.password_changed': AuthPasswordChanged,
  'auth.account_deleted': AuthAccountDeleted,
  'auth.invitation_accepted': InvitationAccepted,

  // User
  'user.created': UserCreated,
  'user.updated': UserUpdated,
  'user.deleted': UserDeleted,
  'user.profile_updated': UserProfileUpdated,
  'user.email_changed': UserEmailChanged,
  'user.avatar_updated': UserAvatarUpdated,

  // Practice
  'practice.created': PracticeCreated,
  'practice.updated': PracticeUpdated,
  'practice.deleted': PracticeDeleted,
  'practice.details_created': PracticeDetailsCreated,
  'practice.details_updated': PracticeDetailsUpdated,
  'practice.details_deleted': PracticeDetailsDeleted,
  'practice.member_invited': PracticeMemberInvited,
  'practice.member_joined': PracticeMemberJoined,
  'practice.switched': PracticeSwitched,
  'practice.access_denied': PracticeAccessDenied,

  // Settings
  'settings.created': SettingsCreated,
  'settings.updated': SettingsUpdated,
  'settings.deleted': SettingsDeleted,
  'settings.user_updated': UserSettingsUpdated,
  'settings.practice_updated': PracticeSettingsUpdated,
  'settings.category_updated': SettingsCategoryUpdated,

  // Onboarding
  'onboarding.started': OnboardingStarted,
  'onboarding.completed': OnboardingCompleted,
  'onboarding.completed_processed': OnboardingCompletedProcessed,
  'onboarding.failed': OnboardingFailed,
  'onboarding.account_updated': OnboardingAccountUpdated,
  'onboarding.account_requirements_changed': OnboardingAccountRequirementsChanged,
  'onboarding.account_capabilities_updated': OnboardingAccountCapabilitiesUpdated,
  'onboarding.external_account_created': OnboardingExternalAccountCreated,
  'onboarding.external_account_updated': OnboardingExternalAccountUpdated,
  'onboarding.external_account_deleted': OnboardingExternalAccountDeleted,
  'onboarding.webhook_received': OnboardingWebhookReceived,
  'onboarding.webhook_processed': OnboardingWebhookProcessed,
  'onboarding.webhook_failed': OnboardingWebhookFailed,

  // Payment
  'payment.session_created': PaymentSessionCreated,
  'payment.received': PaymentReceived,
  'payment.succeeded': PaymentSucceeded,
  'payment.failed': PaymentFailed,
  'payment.canceled': PaymentCanceled,
  'payment.refunded': PaymentRefunded,

  // Intake Payment
  'intake_payment.created': IntakePaymentCreated,
  'intake_payment.succeeded': IntakePaymentSucceeded,
  'intake_payment.failed': IntakePaymentFailed,
  'intake_payment.canceled': IntakePaymentCanceled,

  // Subscription
  'subscription.created': SubscriptionCreated,
  'subscription.updated': SubscriptionUpdated,
  'subscription.cancelled': SubscriptionCancelled,
  'subscription.renewed': SubscriptionRenewed,
  'subscription.payment_failed': SubscriptionPaymentFailed,

  // Client
  'client.created': ClientCreated,
  'client.updated': ClientUpdated,
  'client.deleted': ClientDeleted,
  'client.status_changed': ClientStatusChanged,

  // Engagement contract
  'engagement_contract.created': EngagementContractCreated,
  'engagement_contract.sent': EngagementContractSent,
  'engagement_contract.accepted': EngagementContractAccepted,
  'engagement_contract.declined': EngagementContractDeclined,
  'conflict_check.completed': ConflictCheckCompleted,

  // System
  'system.health_check_performed': SystemHealthCheckPerformed,
  'system.error_occurred': SystemErrorOccurred,
  'system.performance_degraded': SystemPerformanceDegraded,
  'session.created': SessionCreated,
  'session.expired': SessionExpired,
  'session.invalidated': SessionInvalidated,

  // Matter
  'matter.created': MatterCreated,
  'matter.updated': MatterUpdated,
  'matter.deleted': MatterDeleted,
  'matter.status_changed': MatterStatusChanged,

  // Intake
  'intake.submitted': IntakeSubmitted,
  'intake.triaged': IntakeTriaged,

  // Invoice
  'invoice.created': InvoiceCreated,
  'invoice.updated': InvoiceUpdated,
  'invoice.sent': InvoiceSent,
  'invoice.paid': InvoicePaid,
  'invoice.refunded': InvoiceRefunded,
  'invoice.payment_failed': InvoicePaymentFailed,
  'invoice.voided': InvoiceVoided,
  'invoice.deleted': InvoiceDeleted,

  // KrabiClaw
  'krabiclaw.actor_attributed': KrabiClawActorAttributed,
} as const;
