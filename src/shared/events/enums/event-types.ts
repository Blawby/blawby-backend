/**
 * Event Types Enum
 *
 * Centralized event type definitions following the naming convention:
 * {domain}.{object}_{past_tense_verb}
 *
 * Usage:
 * - Import: import { EventType } from '@/shared/events/enums/event-types';
 * - Use: EventType.AUTH_USER_SIGNED_UP
 */

export enum EventType {
  // Stripe account events
  STRIPE_CONNECTED_ACCOUNT_CREATED = 'stripe.connected_account_created',
  STRIPE_CONNECTED_ACCOUNT_UPDATED = 'stripe.connected_account_updated',
  STRIPE_CONNECTED_ACCOUNT_DELETED = 'stripe.connected_account_deleted',

  // Stripe customer events
  STRIPE_CUSTOMER_CREATED = 'stripe.customer.created',
  STRIPE_CUSTOMER_UPDATED = 'stripe.customer.updated',
  STRIPE_CUSTOMER_DELETED = 'stripe.customer.deleted',
  STRIPE_CUSTOMER_SYNC_FAILED = 'stripe.customer.sync_failed',

  // Authentication events
  AUTH_USER_SIGNED_UP = 'auth.user_signed_up',
  AUTH_EMAIL_VERIFIED = 'auth.email_verified',
  AUTH_USER_LOGGED_IN = 'auth.user_logged_in',
  AUTH_USER_LOGGED_OUT = 'auth.user_logged_out',
  AUTH_PASSWORD_RESET_REQUESTED = 'auth.password_reset_requested',
  AUTH_PASSWORD_CHANGED = 'auth.password_changed',
  AUTH_ACCOUNT_DELETED = 'auth.account_deleted',

  // User CRUD events
  USER_CREATED = 'user.created',
  USER_UPDATED = 'user.updated',
  USER_DELETED = 'user.deleted',
  USER_PROFILE_UPDATED = 'user.profile_updated',
  USER_EMAIL_CHANGED = 'user.email_changed',
  USER_AVATAR_UPDATED = 'user.avatar_updated',

  // Practice events (unified - practice = organization + details)
  PRACTICE_CREATED = 'practice.created',
  PRACTICE_UPDATED = 'practice.updated',
  PRACTICE_DELETED = 'practice.deleted',
  PRACTICE_DETAILS_CREATED = 'practice.details_created',
  PRACTICE_DETAILS_UPDATED = 'practice.details_updated',
  PRACTICE_DETAILS_DELETED = 'practice.details_deleted',
  PRACTICE_SPECIALTIES_UPDATED = 'practice.specialties_updated',
  PRACTICE_CONTACT_INFO_UPDATED = 'practice.contact_info_updated',
  PRACTICE_MEMBER_INVITED = 'practice.member_invited',
  PRACTICE_MEMBER_JOINED = 'practice.member_joined',
  PRACTICE_MEMBER_ROLE_CHANGED = 'practice.member_role_changed',
  PRACTICE_MEMBER_REMOVED = 'practice.member_removed',
  PRACTICE_MEMBER_LEFT = 'practice.member_left',
  PRACTICE_SWITCHED = 'practice.switched',
  PRACTICE_ACCESS_DENIED = 'practice.access_denied',

  // Settings events
  SETTINGS_CREATED = 'settings.created',
  SETTINGS_UPDATED = 'settings.updated',
  SETTINGS_DELETED = 'settings.deleted',
  USER_SETTINGS_UPDATED = 'settings.user_updated',
  PRACTICE_SETTINGS_UPDATED = 'settings.practice_updated',
  SETTINGS_CATEGORY_UPDATED = 'settings.category_updated',

  // Onboarding events
  ONBOARDING_STARTED = 'onboarding.started',
  ONBOARDING_COMPLETED = 'onboarding.completed',
  ONBOARDING_FAILED = 'onboarding.failed',
  ONBOARDING_ACCOUNT_UPDATED = 'onboarding.account_updated',
  ONBOARDING_ACCOUNT_REQUIREMENTS_CHANGED = 'onboarding.account_requirements_changed',
  ONBOARDING_ACCOUNT_CAPABILITIES_UPDATED = 'onboarding.account_capabilities_updated',
  ONBOARDING_EXTERNAL_ACCOUNT_CREATED = 'onboarding.external_account_created',
  ONBOARDING_EXTERNAL_ACCOUNT_UPDATED = 'onboarding.external_account_updated',
  ONBOARDING_EXTERNAL_ACCOUNT_DELETED = 'onboarding.external_account_deleted',
  ONBOARDING_WEBHOOK_RECEIVED = 'onboarding.webhook_received',
  ONBOARDING_WEBHOOK_PROCESSED = 'onboarding.webhook_processed',
  ONBOARDING_WEBHOOK_FAILED = 'onboarding.webhook_failed',

  // Payment events
  PAYMENT_SESSION_CREATED = 'payment.session_created',
  PAYMENT_RECEIVED = 'payment.received',
  PAYMENT_SUCCEEDED = 'payment.succeeded',
  PAYMENT_FAILED = 'payment.failed',
  PAYMENT_CANCELED = 'payment.canceled',
  PAYMENT_REFUNDED = 'payment.refunded',

  // Intake payment events
  INTAKE_PAYMENT_CREATED = 'intake_payment.created',
  INTAKE_PAYMENT_SUCCEEDED = 'intake_payment.succeeded',
  INTAKE_PAYMENT_FAILED = 'intake_payment.failed',
  INTAKE_PAYMENT_CANCELED = 'intake_payment.canceled',

  // Subscription events
  SUBSCRIPTION_CREATED = 'subscription.created',
  SUBSCRIPTION_UPDATED = 'subscription.updated',
  SUBSCRIPTION_CANCELLED = 'subscription.cancelled',
  SUBSCRIPTION_RENEWED = 'subscription.renewed',
  SUBSCRIPTION_PAYMENT_FAILED = 'subscription.payment_failed',

  // System events
  SYSTEM_HEALTH_CHECK_PERFORMED = 'system.health_check_performed',
  SYSTEM_ERROR_OCCURRED = 'system.error_occurred',
  SYSTEM_PERFORMANCE_DEGRADED = 'system.performance_degraded',
  SESSION_CREATED = 'session.created',
  SESSION_EXPIRED = 'session.expired',
  SESSION_INVALIDATED = 'session.invalidated'
}

// Helper type for event type values
export type EventTypeValue = `${EventType}`;

// Helper functions for event type validation
export const isValidEventType = (value: string): value is EventTypeValue => {
  return Object.values(EventType).includes(value as EventType);
};

export const getEventTypeByDomain = (domain: string): EventType[] => {
  return Object.values(EventType).filter((type) => type.startsWith(`${domain}.`));
};

// Event type groups for easier filtering
export const EVENT_DOMAINS = {
  AUTH: 'auth',
  USER: 'user',
  PRACTICE: 'practice',
  SETTINGS: 'settings',
  ONBOARDING: 'onboarding',
  PAYMENT: 'payment',
  INTAKE_PAYMENT: 'intake_payment',
  STRIPE_CUSTOMER: 'stripe_customer',
  SYSTEM: 'system',
  SESSION: 'session',
} as const;

export type EventDomain = (typeof EVENT_DOMAINS)[keyof typeof EVENT_DOMAINS];
