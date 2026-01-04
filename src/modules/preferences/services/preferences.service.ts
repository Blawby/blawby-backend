/**
 * Preferences Service
 *
 * Service layer for preferences operations
 * Handles category-based preference updates
 */

import { db } from '@/shared/database';
import { preferences } from '../schema/preferences.schema';
import type {
  Preferences,
  PreferenceCategory,
  GeneralPreferences,
  NotificationPreferences,
  SecurityPreferences,
  AccountPreferences,
  OnboardingPreferences,
} from '../schema/preferences.schema';
import { eq } from 'drizzle-orm';

// Profile fields (phone, dob) are now in users table via Better Auth additionalFields
// This interface kept for backward compatibility
export interface UpdateProfileData {
  phone?: string;
  phoneCountryCode?: string;
  dob?: string; // Date string in YYYY-MM-DD format
}

/**
 * Get all preferences for a user
 */
export const getPreferences = async (userId: string): Promise<Preferences | undefined> => {
  const result = await db
    .select()
    .from(preferences)
    .where(eq(preferences.userId, userId))
    .limit(1);

  return result[0];
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

  return (result[0]?.[category] as Record<string, unknown>) || {};
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

  return (result[0]?.[category] as Record<string, unknown>) || {};
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
 * Legacy function names for backward compatibility
 */
export const getUserDetails = getPreferences;
export const updateUserDetails = updateProfileFields;

