/**
 * Event Definitions Aggregator
 *
 * Centralized place for all event classes. This file re-exports domain-specific
 * definitions to maintain a single import point while keeping the code base modular.
 *
 * Usage:
 *   import { ClientCreated } from '@/shared/events/definitions';
 */

import * as auth from './definitions/auth';
import * as invoices from './definitions/invoices';
import * as matters from './definitions/matters';
import * as onboarding from './definitions/onboarding';
import * as payments from './definitions/payments';
import * as practice from './definitions/practice';
import * as settings from './definitions/settings';
import * as stripe from './definitions/stripe';
import * as subscriptions from './definitions/subscriptions';
import * as system from './definitions/system';
import * as client from './definitions/client';
import * as users from './definitions/users';

// Re-export everything for backward compatibility
export * from './definitions/auth';
export * from './definitions/invoices';
export * from './definitions/matters';
export * from './definitions/onboarding';
export * from './definitions/payments';
export * from './definitions/practice';
export * from './definitions/settings';
export * from './definitions/stripe';
export * from './definitions/subscriptions';
export * from './definitions/system';
export * from './definitions/client';
export * from './definitions/users';

/**
 * Map of event type strings to event classes
 * Useful for dynamic event handling and reverse lookup
 */
export const EventClasses = {
  // Stripe Account
  'stripe.connected_account_created': stripe.StripeConnectedAccountCreated,
  'stripe.connected_account_updated': stripe.StripeConnectedAccountUpdated,
  'stripe.connected_account_deleted': stripe.StripeConnectedAccountDeleted,

  // Stripe Customer
  'stripe.customer.created': stripe.StripeCustomerCreated,
  'stripe.customer.updated': stripe.StripeCustomerUpdated,
  'stripe.customer.deleted': stripe.StripeCustomerDeleted,
  'stripe.customer.sync_failed': stripe.StripeCustomerSyncFailed,

  // Auth
  'auth.user_signed_up': auth.AuthUserSignedUp,
  'auth.email_verified': auth.AuthEmailVerified,
  'auth.user_logged_in': auth.AuthUserLoggedIn,
  'auth.user_logged_out': auth.AuthUserLoggedOut,
  'auth.password_reset_requested': auth.AuthPasswordResetRequested,
  'auth.password_changed': auth.AuthPasswordChanged,
  'auth.account_deleted': auth.AuthAccountDeleted,
  'auth.invitation_accepted': auth.InvitationAccepted,

  // User
  'user.created': users.UserCreated,
  'user.updated': users.UserUpdated,
  'user.deleted': users.UserDeleted,
  'user.profile_updated': users.UserProfileUpdated,
  'user.email_changed': users.UserEmailChanged,
  'user.avatar_updated': users.UserAvatarUpdated,

  // Practice
  'practice.created': practice.PracticeCreated,
  'practice.updated': practice.PracticeUpdated,
  'practice.deleted': practice.PracticeDeleted,
  'practice.details_created': practice.PracticeDetailsCreated,
  'practice.details_updated': practice.PracticeDetailsUpdated,
  'practice.details_deleted': practice.PracticeDetailsDeleted,
  'practice.specialties_updated': practice.PracticeSpecialtiesUpdated,
  'practice.contact_info_updated': practice.PracticeContactInfoUpdated,
  'practice.member_invited': practice.PracticeMemberInvited,
  'practice.member_joined': practice.PracticeMemberJoined,
  'practice.member_role_changed': practice.PracticeMemberRoleChanged,
  'practice.member_removed': practice.PracticeMemberRemoved,
  'practice.member_left': practice.PracticeMemberLeft,
  'practice.switched': practice.PracticeSwitched,
  'practice.access_denied': practice.PracticeAccessDenied,

  // Settings
  'settings.created': settings.SettingsCreated,
  'settings.updated': settings.SettingsUpdated,
  'settings.deleted': settings.SettingsDeleted,
  'settings.user_updated': settings.UserSettingsUpdated,
  'settings.practice_updated': settings.PracticeSettingsUpdated,
  'settings.category_updated': settings.SettingsCategoryUpdated,

  // Onboarding
  'onboarding.started': onboarding.OnboardingStarted,
  'onboarding.completed': onboarding.OnboardingCompleted,
  'onboarding.completed_processed': onboarding.OnboardingCompletedProcessed,
  'onboarding.failed': onboarding.OnboardingFailed,
  'onboarding.account_updated': onboarding.OnboardingAccountUpdated,
  'onboarding.account_requirements_changed': onboarding.OnboardingAccountRequirementsChanged,
  'onboarding.account_capabilities_updated': onboarding.OnboardingAccountCapabilitiesUpdated,
  'onboarding.external_account_created': onboarding.OnboardingExternalAccountCreated,
  'onboarding.external_account_updated': onboarding.OnboardingExternalAccountUpdated,
  'onboarding.external_account_deleted': onboarding.OnboardingExternalAccountDeleted,
  'onboarding.webhook_received': onboarding.OnboardingWebhookReceived,
  'onboarding.webhook_processed': onboarding.OnboardingWebhookProcessed,
  'onboarding.webhook_failed': onboarding.OnboardingWebhookFailed,

  // Payment
  'payment.session_created': payments.PaymentSessionCreated,
  'payment.received': payments.PaymentReceived,
  'payment.succeeded': payments.PaymentSucceeded,
  'payment.failed': payments.PaymentFailed,
  'payment.canceled': payments.PaymentCanceled,
  'payment.refunded': payments.PaymentRefunded,

  // Intake Payment
  'intake_payment.created': payments.IntakePaymentCreated,
  'intake_payment.succeeded': payments.IntakePaymentSucceeded,
  'intake_payment.failed': payments.IntakePaymentFailed,
  'intake_payment.canceled': payments.IntakePaymentCanceled,

  // Subscription
  'subscription.created': subscriptions.SubscriptionCreated,
  'subscription.updated': subscriptions.SubscriptionUpdated,
  'subscription.cancelled': subscriptions.SubscriptionCancelled,
  'subscription.renewed': subscriptions.SubscriptionRenewed,
  'subscription.payment_failed': subscriptions.SubscriptionPaymentFailed,

  // Client
  'client.created': client.ClientCreated,
  'client.updated': client.ClientUpdated,
  'client.deleted': client.ClientDeleted,
  'client.status_changed': client.ClientStatusChanged,

  // System
  'system.health_check_performed': system.SystemHealthCheckPerformed,
  'system.error_occurred': system.SystemErrorOccurred,
  'system.performance_degraded': system.SystemPerformanceDegraded,
  'session.created': system.SessionCreated,
  'session.expired': system.SessionExpired,
  'session.invalidated': system.SessionInvalidated,

  // Matter
  'matter.created': matters.MatterCreated,
  'matter.updated': matters.MatterUpdated,
  'matter.deleted': matters.MatterDeleted,
  'matter.status_changed': matters.MatterStatusChanged,

  // Invoice
  'invoice.created': invoices.InvoiceCreated,
  'invoice.updated': invoices.InvoiceUpdated,
  'invoice.sent': invoices.InvoiceSent,
  'invoice.paid': invoices.InvoicePaid,
  'invoice.payment_failed': invoices.InvoicePaymentFailed,
  'invoice.voided': invoices.InvoiceVoided,
  'invoice.deleted': invoices.InvoiceDeleted,
} as const;
