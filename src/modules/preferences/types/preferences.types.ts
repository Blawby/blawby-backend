/**
 * Preferences Types
 *
 * TypeScript type definitions for user preferences
 */

// Product usage options enum (kept for backward compatibility during migration)
export const PRODUCT_USAGE_OPTIONS = [
  'personal_legal_issue',
  'business_legal_needs',
  'legal_research',
  'document_review',
  'others',
] as const;

export type ProductUsage = typeof PRODUCT_USAGE_OPTIONS[number];

/**
 * General user preferences
 */
export type GeneralPreferences = {
  /** UI theme preference: 'light' | 'dark' | 'system' */
  theme?: string;
  /** Accent color in hex format */
  accent_color?: string;
  /** Language code: 'en' | 'es' | etc. */
  language?: string;
  /** Spoken language for voice/audio features */
  spoken_language?: string;
  /** Timezone identifier: 'America/New_York' */
  timezone?: string;
  /** Date format: 'MM/DD/YYYY' | 'DD/MM/YYYY' */
  date_format?: string;
  /** Time format: '12h' | '24h' */
  time_format?: string;
};

/**
 * Notification preferences
 * Controls how and when users receive notifications
 */
export type NotificationPreferences = {
  /** Enable push notifications for messages */
  messages_push?: boolean;
  /** Enable email notifications for messages */
  messages_email?: boolean;
  /** Only notify on mentions in messages */
  messages_mentions_only?: boolean;
  /** Enable push notifications for payments */
  payments_push?: boolean;
  /** Enable email notifications for payments */
  payments_email?: boolean;
  /** Enable push notifications for intakes */
  intakes_push?: boolean;
  /** Enable email notifications for intakes */
  intakes_email?: boolean;
  /** Enable push notifications for matters */
  matters_push?: boolean;
  /** Enable email notifications for matters */
  matters_email?: boolean;
  /** Enable push notifications for system events (always true) */
  system_push?: boolean;
  /** Enable email notifications for system events (always true) */
  system_email?: boolean;
  /** Enable desktop push notifications */
  desktop_push_enabled?: boolean;
};

/**
 * Default notification preferences
 * Applied when user has no stored preferences
 */
export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  messages_push: true,
  messages_email: true,
  messages_mentions_only: false,
  payments_push: true,
  payments_email: true,
  intakes_push: true,
  intakes_email: true,
  matters_push: true,
  matters_email: true,
  system_push: true,
  system_email: true,
  desktop_push_enabled: false,
};

/**
 * Security preferences
 */
export type SecurityPreferences = {
  /** Enable two-factor authentication */
  two_factor_enabled?: boolean;
  /** Enable email notifications for security events */
  email_notifications?: boolean;
  /** Enable login alerts */
  login_alerts?: boolean;
  /** Session timeout in minutes */
  session_timeout?: number;
};

/**
 * Account preferences
 */
export type AccountPreferences = {
  /** Selected domain for the account */
  selected_domain?: string | null;
  /** Custom domains associated with the account */
  custom_domains?: string | null;
  /** Receive feedback emails */
  receive_feedback_emails?: boolean;
  /** Receive marketing emails */
  marketing_emails?: boolean;
  /** Receive security alerts */
  security_alerts?: boolean;
};

/**
 * Onboarding preferences
 * Stores user onboarding data and preferences
 */
export type OnboardingPreferences = {
  /** User's birthday as ISO date string */
  birthday?: string;
  /** Primary use case for the platform */
  primary_use_case?: string;
  /** Additional information about use case */
  use_case_additional_info?: string;
  /** Whether onboarding is completed */
  completed?: boolean;
  /** Product usage categories (migrated from old product_usage column) */
  product_usage?: ProductUsage[];
};

/**
 * Preference category options
 * Single source of truth for valid preference categories
 */
export const PREFERENCE_CATEGORIES = [
  'general',
  'notifications',
  'security',
  'account',
  'onboarding',
  'profile',
] as const;

/**
 * Preference category type
 * Valid categories for preference updates
 * Derived from PREFERENCE_CATEGORIES constant
 */
export type PreferenceCategory = typeof PREFERENCE_CATEGORIES[number];
