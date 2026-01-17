/**
 * Preferences Service
 *
 * Service layer for preferences operations
 * Handles category-based preference updates
 */

import { db } from '@/shared/database';
import { preferences } from '@/modules/preferences/schema/preferences.schema';
import type { Preferences } from '@/modules/preferences/schema/preferences.schema';
import type {
  PreferenceCategory,
  GeneralPreferences,
  NotificationPreferences,
  SecurityPreferences,
  AccountPreferences,
  OnboardingPreferences,
} from '@/modules/preferences/types/preferences.types';
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  DEFAULT_ONBOARDING_PREFERENCES,
} from '@/modules/preferences/types/preferences.types';
import { eq } from 'drizzle-orm';

// Profile fields (phone, dob) are now in users table via Better Auth additionalFields
// This interface kept for backward compatibility
export interface UpdateProfileData {
  phone?: string;
  phoneCountryCode?: string;
  dob?: string; // Date string in YYYY-MM-DD format
}

/**
 * Apply default values to notification preferences
 * Merges stored preferences with defaults, ensuring all fields are present
 */
const applyNotificationDefaults = (
  stored: Record<string, unknown> | null | undefined,
): NotificationPreferences => {
  const storedPrefs = (stored as NotificationPreferences) || {};
  return {
    ...DEFAULT_NOTIFICATION_PREFERENCES,
    ...storedPrefs,
    // Always force system fields to true
    system_push: true,
    system_email: true,
  };
};

/**
 * Apply default values to onboarding preferences
 * Merges stored preferences with defaults, ensuring boolean flags default to false
 */
const applyOnboardingDefaults = (
  stored: Record<string, unknown> | null | undefined,
): OnboardingPreferences => {
  const storedPrefs = (stored as OnboardingPreferences) || {};
  return {
    ...DEFAULT_ONBOARDING_PREFERENCES,
    ...storedPrefs,
  };
};

/**
 * Get all preferences for a user
 */
export const getPreferences = async (userId: string): Promise<Preferences | undefined> => {
  const result = await db
    .select()
    .from(preferences)
    .where(eq(preferences.userId, userId))
    .limit(1);

  if (!result[0]) {
    return undefined;
  }

  // Apply defaults to notifications and onboarding fields
  const prefs = result[0];
  return {
    ...prefs,
    notifications: applyNotificationDefaults(prefs.notifications),
    onboarding: applyOnboardingDefaults(prefs.onboarding),
  };
};

/**
 * Get preferences by category
 */
export const getPreferencesByCategory = async (
  userId: string,
  category: PreferenceCategory,
): Promise<Record<string, unknown>> => {
  if (category === 'profile') {
    // Profile fields are now in users table via Better Auth
    // Return empty object - profile should be fetched from session/user
    return {};
  }

  const result = await db
    .select({
      [category]: preferences[category],
    })
    .from(preferences)
    .where(eq(preferences.userId, userId))
    .limit(1);

  const categoryData = (result[0]?.[category] as Record<string, unknown>) || {};

  // Apply defaults for notifications category
  if (category === 'notifications') {
    return applyNotificationDefaults(categoryData);
  }

  return categoryData;
};

/**
 * Update preferences by category
 */
export const updatePreferencesByCategory = async (
  userId: string,
  category: PreferenceCategory,
  data: Record<string, unknown>,
): Promise<Record<string, unknown>> => {
  if (category === 'profile') {
    // Profile fields are now in users table via Better Auth
    // Updates should go through Better Auth updateUser endpoint
    throw new Error('Profile fields should be updated via Better Auth updateUser endpoint');
  }

  // Handle notifications category with special logic
  if (category === 'notifications') {
    // Get existing notifications preferences
    const existing = await getPreferencesByCategory(userId, 'notifications');
    // Merge with incoming data (partial update)
    const merged = { ...existing, ...data };
    // Force system fields always true
    merged.system_push = true;
    merged.system_email = true;
    // Use merged data for update
    data = merged;
  }

  const result = await db
    .update(preferences)
    .set({
      [category]: data,
      updatedAt: new Date(),
    })
    .where(eq(preferences.userId, userId))
    .returning({
      [category]: preferences[category],
    });

  const updatedData = (result[0]?.[category] as Record<string, unknown>) || {};

  // Apply defaults for notifications category in response
  if (category === 'notifications') {
    return applyNotificationDefaults(updatedData);
  }

  // Apply defaults for onboarding category in response
  if (category === 'onboarding') {
    return applyOnboardingDefaults(updatedData);
  }

  return updatedData;
};

/**
 * Update profile fields (phone, dob)
 * Legacy function - profile fields are now in users table via Better Auth
 * This function is kept for backward compatibility but should not be used
 * @deprecated Use Better Auth updateUser endpoint instead
 */
export const updateProfileFields = async (
  userId: string,
  data: UpdateProfileData,
): Promise<Preferences> => {
  // Profile fields are now managed by Better Auth
  // Return preferences without updating profile fields
  const prefs = await getPreferences(userId);
  if (!prefs) {
    throw new Error('Preferences not found');
  }
  return prefs;
};

/**
 * Initialize preferences for a new user (invoked via AUTH_USER_SIGNED_UP event).
 * Creates a preferences row with default notification and onboarding settings
 * (e.g. welcome_modal_shown: false, practice_welcome_shown: false).
 */
export const initializeUserPreferences = async (userId: string): Promise<Preferences> => {
  const existing = await getPreferences(userId);
  if (existing) {
    return existing;
  }

  const result = await db
    .insert(preferences)
    .values({
      userId,
      notifications: DEFAULT_NOTIFICATION_PREFERENCES,
      general: {},
      security: {},
      account: {},
      onboarding: DEFAULT_ONBOARDING_PREFERENCES,
    })
    .returning();

  const inserted = result[0];
  if (!inserted) {
    throw new Error(`Failed to create preferences for user ${userId}`);
  }
  return inserted;
};

/**
 * Legacy function names for backward compatibility
 */
export const getUserDetails = getPreferences;
export const updateUserDetails = updateProfileFields;

