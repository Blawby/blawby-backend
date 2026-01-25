/**
 * Event Definitions
 *
 * Typed event classes for all event types. Each class extends BaseEvent
 * and provides type-safe payloads.
 *
 * Usage:
 *   await ClientCreated.dispatch({ client_id: '...', name: '...' });
 */

import { BaseEvent } from './event';

// ═══════════════════════════════════════════════════════════════════════════
// STRIPE ACCOUNT EVENTS
// ═══════════════════════════════════════════════════════════════════════════

export class StripeConnectedAccountCreated extends BaseEvent<Record<string, unknown>> {
  static type = 'stripe.connected_account_created' as const;
}

export class StripeConnectedAccountUpdated extends BaseEvent<Record<string, unknown>> {
  static type = 'stripe.connected_account_updated' as const;
}

export class StripeConnectedAccountDeleted extends BaseEvent<Record<string, unknown>> {
  static type = 'stripe.connected_account_deleted' as const;
}

// ═══════════════════════════════════════════════════════════════════════════
// STRIPE CUSTOMER EVENTS
// ═══════════════════════════════════════════════════════════════════════════

export class StripeCustomerCreated extends BaseEvent<Record<string, unknown>> {
  static type = 'stripe.customer.created' as const;
}

export class StripeCustomerUpdated extends BaseEvent<Record<string, unknown>> {
  static type = 'stripe.customer.updated' as const;
}

export class StripeCustomerDeleted extends BaseEvent<Record<string, unknown>> {
  static type = 'stripe.customer.deleted' as const;
}

export class StripeCustomerSyncFailed extends BaseEvent<Record<string, unknown>> {
  static type = 'stripe.customer.sync_failed' as const;
}

// ═══════════════════════════════════════════════════════════════════════════
// AUTHENTICATION EVENTS
// ═══════════════════════════════════════════════════════════════════════════

export class AuthUserSignedUp extends BaseEvent<{
  actor_id: string;
  user_id: string;
  email: string;
  name: string | null;
  signup_method: string;
  is_anonymous: boolean;
}> {
  static type = 'auth.user_signed_up' as const;
}

export class AuthEmailVerified extends BaseEvent<{
  user_id: string;
  email: string;
}> {
  static type = 'auth.email_verified' as const;
}

export class AuthUserLoggedIn extends BaseEvent<{
  user_id: string;
  session_id: string;
}> {
  static type = 'auth.user_logged_in' as const;
}

export class AuthUserLoggedOut extends BaseEvent<{
  user_id: string;
  session_id: string;
}> {
  static type = 'auth.user_logged_out' as const;
}

export class AuthPasswordResetRequested extends BaseEvent<{
  user_id: string;
  email: string;
}> {
  static type = 'auth.password_reset_requested' as const;
}

export class AuthPasswordChanged extends BaseEvent<{
  user_id: string;
}> {
  static type = 'auth.password_changed' as const;
}

export class AuthAccountDeleted extends BaseEvent<{
  user_id: string;
  email: string;
}> {
  static type = 'auth.account_deleted' as const;
}

// ═══════════════════════════════════════════════════════════════════════════
// USER CRUD EVENTS
// ═══════════════════════════════════════════════════════════════════════════

export class UserCreated extends BaseEvent<Record<string, unknown>> {
  static type = 'user.created' as const;
}

export class UserUpdated extends BaseEvent<Record<string, unknown>> {
  static type = 'user.updated' as const;
}

export class UserDeleted extends BaseEvent<Record<string, unknown>> {
  static type = 'user.deleted' as const;
}

export class UserProfileUpdated extends BaseEvent<Record<string, unknown>> {
  static type = 'user.profile_updated' as const;
}

export class UserEmailChanged extends BaseEvent<Record<string, unknown>> {
  static type = 'user.email_changed' as const;
}

export class UserAvatarUpdated extends BaseEvent<Record<string, unknown>> {
  static type = 'user.avatar_updated' as const;
}

// ═══════════════════════════════════════════════════════════════════════════
// PRACTICE EVENTS
// ═══════════════════════════════════════════════════════════════════════════

export class PracticeCreated extends BaseEvent<Record<string, unknown>> {
  static type = 'practice.created' as const;
}

export class PracticeUpdated extends BaseEvent<Record<string, unknown>> {
  static type = 'practice.updated' as const;
}

export class PracticeDeleted extends BaseEvent<Record<string, unknown>> {
  static type = 'practice.deleted' as const;
}

export class PracticeDetailsCreated extends BaseEvent<Record<string, unknown>> {
  static type = 'practice.details_created' as const;
}

export class PracticeDetailsUpdated extends BaseEvent<Record<string, unknown>> {
  static type = 'practice.details_updated' as const;
}

export class PracticeDetailsDeleted extends BaseEvent<Record<string, unknown>> {
  static type = 'practice.details_deleted' as const;
}

export class PracticeSpecialtiesUpdated extends BaseEvent<Record<string, unknown>> {
  static type = 'practice.specialties_updated' as const;
}

export class PracticeContactInfoUpdated extends BaseEvent<Record<string, unknown>> {
  static type = 'practice.contact_info_updated' as const;
}

export class PracticeMemberInvited extends BaseEvent<Record<string, unknown>> {
  static type = 'practice.member_invited' as const;
}

export class PracticeMemberJoined extends BaseEvent<Record<string, unknown>> {
  static type = 'practice.member_joined' as const;
}

export class PracticeMemberRoleChanged extends BaseEvent<Record<string, unknown>> {
  static type = 'practice.member_role_changed' as const;
}

export class PracticeMemberRemoved extends BaseEvent<Record<string, unknown>> {
  static type = 'practice.member_removed' as const;
}

export class PracticeMemberLeft extends BaseEvent<Record<string, unknown>> {
  static type = 'practice.member_left' as const;
}

export class PracticeSwitched extends BaseEvent<Record<string, unknown>> {
  static type = 'practice.switched' as const;
}

export class PracticeAccessDenied extends BaseEvent<{
  user_id: string;
  organization_id: string;
  reason: string;
}> {
  static type = 'practice.access_denied' as const;
}

// ═══════════════════════════════════════════════════════════════════════════
// SETTINGS EVENTS
// ═══════════════════════════════════════════════════════════════════════════

export class SettingsCreated extends BaseEvent<Record<string, unknown>> {
  static type = 'settings.created' as const;
}

export class SettingsUpdated extends BaseEvent<Record<string, unknown>> {
  static type = 'settings.updated' as const;
}

export class SettingsDeleted extends BaseEvent<Record<string, unknown>> {
  static type = 'settings.deleted' as const;
}

export class UserSettingsUpdated extends BaseEvent<Record<string, unknown>> {
  static type = 'settings.user_updated' as const;
}

export class PracticeSettingsUpdated extends BaseEvent<Record<string, unknown>> {
  static type = 'settings.practice_updated' as const;
}

export class SettingsCategoryUpdated extends BaseEvent<Record<string, unknown>> {
  static type = 'settings.category_updated' as const;
}

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

// ═══════════════════════════════════════════════════════════════════════════
// PAYMENT EVENTS
// ═══════════════════════════════════════════════════════════════════════════

export class PaymentSessionCreated extends BaseEvent<Record<string, unknown>> {
  static type = 'payment.session_created' as const;
}

export class PaymentReceived extends BaseEvent<Record<string, unknown>> {
  static type = 'payment.received' as const;
}

export class PaymentSucceeded extends BaseEvent<{
  stripe_payment_intent_id: string;
  amount: number;
  currency?: string;
}> {
  static type = 'payment.succeeded' as const;
}

export class PaymentFailed extends BaseEvent<{
  stripe_payment_intent_id: string;
  error?: string;
}> {
  static type = 'payment.failed' as const;
}

export class PaymentCanceled extends BaseEvent<{
  stripe_payment_intent_id: string;
}> {
  static type = 'payment.canceled' as const;
}

export class PaymentRefunded extends BaseEvent<Record<string, unknown>> {
  static type = 'payment.refunded' as const;
}

// ═══════════════════════════════════════════════════════════════════════════
// INTAKE PAYMENT EVENTS
// ═══════════════════════════════════════════════════════════════════════════

export class IntakePaymentCreated extends BaseEvent<Record<string, unknown>> {
  static type = 'intake_payment.created' as const;
}

export class IntakePaymentSucceeded extends BaseEvent<{
  event_id?: string;
  organization_id: string;
  stripe_payment_intent_id: string;
  intake_payment_id: string;
  uuid: string;
  amount: number;
  currency: string;
  client_email?: string;
  client_name?: string;
  stripe_charge_id?: string;
  succeeded_at: string;
}> {
  static type = 'intake_payment.succeeded' as const;
}

export class IntakePaymentFailed extends BaseEvent<{
  stripe_payment_intent_id: string;
  intake_payment_id: string;
  error?: string;
}> {
  static type = 'intake_payment.failed' as const;
}

export class IntakePaymentCanceled extends BaseEvent<{
  stripe_payment_intent_id: string;
  intake_payment_id: string;
}> {
  static type = 'intake_payment.canceled' as const;
}

// ═══════════════════════════════════════════════════════════════════════════
// SUBSCRIPTION EVENTS
// ═══════════════════════════════════════════════════════════════════════════

export class SubscriptionCreated extends BaseEvent<Record<string, unknown>> {
  static type = 'subscription.created' as const;
}

export class SubscriptionUpdated extends BaseEvent<Record<string, unknown>> {
  static type = 'subscription.updated' as const;
}

export class SubscriptionCancelled extends BaseEvent<Record<string, unknown>> {
  static type = 'subscription.cancelled' as const;
}

export class SubscriptionRenewed extends BaseEvent<Record<string, unknown>> {
  static type = 'subscription.renewed' as const;
}

export class SubscriptionPaymentFailed extends BaseEvent<Record<string, unknown>> {
  static type = 'subscription.payment_failed' as const;
}

// ═══════════════════════════════════════════════════════════════════════════
// CLIENT EVENTS
// ═══════════════════════════════════════════════════════════════════════════

export class ClientCreated extends BaseEvent<{
  client_id: string;
  name: string;
  email: string;
  stripe_customer_id?: string;
}> {
  static type = 'client.created' as const;
}

export class ClientUpdated extends BaseEvent<{
  client_id: string;
  changes?: Record<string, unknown>;
}> {
  static type = 'client.updated' as const;
}

export class ClientDeleted extends BaseEvent<{
  client_id: string;
}> {
  static type = 'client.deleted' as const;
}

export class ClientStatusChanged extends BaseEvent<{
  client_id: string;
  old_status: string;
  new_status: string;
}> {
  static type = 'client.status_changed' as const;
}

// ═══════════════════════════════════════════════════════════════════════════
// MATTER EVENTS
// ═══════════════════════════════════════════════════════════════════════════

export class MatterCreated extends BaseEvent<{
  matter_id: string;
  organization_id: string;
  title: string;
  billing_type: string;
}> {
  static type = 'matter.created' as const;
}

export class MatterUpdated extends BaseEvent<{
  matter_id: string;
  organization_id: string;
  changes: Record<string, unknown>;
}> {
  static type = 'matter.updated' as const;
}

export class MatterDeleted extends BaseEvent<{
  matter_id: string;
  organization_id: string;
}> {
  static type = 'matter.deleted' as const;
}

export class MatterStatusChanged extends BaseEvent<{
  matter_id: string;
  organization_id: string;
  old_status: string;
  new_status: string;
}> {
  static type = 'matter.status_changed' as const;
}

// ═══════════════════════════════════════════════════════════════════════════
// SYSTEM EVENTS
// ═══════════════════════════════════════════════════════════════════════════

export class SystemHealthCheckPerformed extends BaseEvent<Record<string, unknown>> {
  static type = 'system.health_check_performed' as const;
}

export class SystemErrorOccurred extends BaseEvent<{
  error: string;
  stack?: string;
  context?: Record<string, unknown>;
}> {
  static type = 'system.error_occurred' as const;
}

export class SystemPerformanceDegraded extends BaseEvent<Record<string, unknown>> {
  static type = 'system.performance_degraded' as const;
}

export class SessionCreated extends BaseEvent<{
  user_id: string;
  session_id: string;
}> {
  static type = 'session.created' as const;
}

export class SessionExpired extends BaseEvent<{
  user_id: string;
  session_id: string;
}> {
  static type = 'session.expired' as const;
}

export class SessionInvalidated extends BaseEvent<{
  user_id: string;
  session_id: string;
}> {
  static type = 'session.invalidated' as const;
}

// ═══════════════════════════════════════════════════════════════════════════
// EVENT TYPE TO CLASS MAP (for reverse lookup)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Map of event type strings to event classes
 * Useful for dynamic event handling
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
  'practice.specialties_updated': PracticeSpecialtiesUpdated,
  'practice.contact_info_updated': PracticeContactInfoUpdated,
  'practice.member_invited': PracticeMemberInvited,
  'practice.member_joined': PracticeMemberJoined,
  'practice.member_role_changed': PracticeMemberRoleChanged,
  'practice.member_removed': PracticeMemberRemoved,
  'practice.member_left': PracticeMemberLeft,
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
} as const;
