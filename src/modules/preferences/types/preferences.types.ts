import { z } from 'zod';
import { preferenceValidations } from '@/modules/preferences/validations/preferences.validation';

// Product usage options enum
export const PRODUCT_USAGE_OPTIONS = [
  'personal_legal_issue',
  'business_legal_needs',
  'legal_research',
  'document_review',
  'others',
] as const;

export type ProductUsage = typeof PRODUCT_USAGE_OPTIONS[number];

/**
 * Theme options for UI appearance
 */
export const THEME_OPTIONS = ['light', 'dark', 'system'] as const;
export type Theme = typeof THEME_OPTIONS[number];

/**
 * Date format options
 */
export const DATE_FORMAT_OPTIONS = ['MM/DD/YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD'] as const;
export type DateFormat = typeof DATE_FORMAT_OPTIONS[number];

/**
 * Time format options
 */
export const TIME_FORMAT_OPTIONS = ['12h', '24h'] as const;
export type TimeFormat = typeof TIME_FORMAT_OPTIONS[number];

/**
 * General user preferences
 */
export type GeneralPreferences = z.infer<typeof preferenceValidations.generalPreferencesSchema>;

/**
 * Notification preferences
 */
export type NotificationPreferences = z.infer<typeof preferenceValidations.notificationPreferencesSchema>;

/**
 * Default notification preferences
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
export type SecurityPreferences = z.infer<typeof preferenceValidations.securityPreferencesSchema>;

/**
 * Account preferences
 */
export type AccountPreferences = z.infer<typeof preferenceValidations.accountPreferencesSchema>;

/**
 * Onboarding preferences
 */
export type OnboardingPreferences = z.infer<typeof preferenceValidations.onboardingPreferencesSchema>;

/**
 * Default onboarding preferences
 */
export const DEFAULT_ONBOARDING_PREFERENCES: OnboardingPreferences = {
  welcome_modal_shown: false,
  practice_welcome_shown: false,
};

/**
 * Preference category options
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
 */
export type PreferenceCategory = typeof PREFERENCE_CATEGORIES[number];

// Inferred from Zod schemas
export type UpdateUserDetailsRequest = z.infer<typeof preferenceValidations.updateUserDetailsSchema>;
export type PreferencesResponse = z.infer<typeof preferenceValidations.preferencesResponseSchema>;
export type CategoryPreferencesResponse = z.infer<typeof preferenceValidations.categoryPreferencesResponseSchema>;
