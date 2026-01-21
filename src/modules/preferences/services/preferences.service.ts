/**
 * Preferences Service
 *
 * Service layer for preferences operations
 * Handles category-based preference updates
 */

import { getLogger } from '@logtape/logtape';
import { db } from '@/shared/database';
import { preferences } from '@/modules/preferences/schema/preferences.schema';
import type { Preferences } from '@/modules/preferences/schema/preferences.schema';
import type {
  PreferenceCategory,
  NotificationPreferences,
  OnboardingPreferences,
} from '@/modules/preferences/types/preferences.types';
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  DEFAULT_ONBOARDING_PREFERENCES,
} from '@/modules/preferences/types/preferences.types';
import { eq } from 'drizzle-orm';
import type { Result } from '@/shared/types/result';
import { ok, internalError, notFound, badRequest } from '@/shared/utils/result';

const logger = getLogger(['preferences', 'service']);

// Profile fields (phone, dob) are now in users table via Better Auth additionalFields
export interface UpdateProfileData {
  phone?: string;
  phoneCountryCode?: string;
  dob?: string; // Date string in YYYY-MM-DD format
}

/**
 * Apply default values to notification preferences
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
 * Preferences Service
 */
export const preferencesService = {
  /**
   * Get all preferences for a user
   */
  async getPreferences(userId: string): Promise<Result<Preferences>> {
    try {
      const result = await db
        .select()
        .from(preferences)
        .where(eq(preferences.userId, userId))
        .limit(1);

      if (!result[0]) {
        return notFound('Preferences not found');
      }

      // Apply defaults to notifications and onboarding fields
      const prefs = result[0];
      return ok({
        ...prefs,
        notifications: applyNotificationDefaults(prefs.notifications),
        onboarding: applyOnboardingDefaults(prefs.onboarding),
      });
    } catch (error) {
      logger.error('Failed to get preferences for user {userId}: {error}', { userId, error });
      return internalError('Failed to retrieve preferences');
    }
  },

  /**
   * Get preferences by category
   */
  async getPreferencesByCategory(
    userId: string,
    category: PreferenceCategory,
  ): Promise<Result<Record<string, unknown>>> {
    try {
      if (category === 'profile') {
        // Profile fields are now in users table via Better Auth
        return ok({});
      }

      const result = await db
        .select({
          [category]: preferences[category],
        })
        .from(preferences)
        .where(eq(preferences.userId, userId))
        .limit(1);

      if (!result[0]) {
        return notFound('Preferences not found');
      }

      const categoryData = (result[0]?.[category] as Record<string, unknown>) || {};

      // Apply defaults for specific categories
      if (category === 'notifications') {
        return ok(applyNotificationDefaults(categoryData));
      }
      if (category === 'onboarding') {
        return ok(applyOnboardingDefaults(categoryData));
      }

      return ok(categoryData);
    } catch (error) {
      logger.error('Failed to get preferences category {category} for user {userId}: {error}', {
        userId,
        category,
        error,
      });
      return internalError(`Failed to retrieve ${category} preferences`);
    }
  },

  /**
   * Update preferences by category
   */
  async updatePreferencesByCategory(
    userId: string,
    category: PreferenceCategory,
    data: Record<string, unknown>,
  ): Promise<Result<Record<string, unknown>>> {
    try {
      if (category === 'profile') {
        return badRequest('Profile fields should be updated via Better Auth updateUser endpoint');
      }

      // Handle notifications category with special logic
      let dataToUpdate = data;
      if (category === 'notifications') {
        const existingResult = await preferencesService.getPreferencesByCategory(userId, 'notifications');
        const existing = existingResult.success ? existingResult.data : {};
        // Merge with incoming data (partial update)
        const merged = { ...existing, ...data };
        // Force system fields always true
        merged.system_push = true;
        merged.system_email = true;
        dataToUpdate = merged;
      }

      const result = await db
        .update(preferences)
        .set({
          [category]: dataToUpdate,
          updatedAt: new Date(),
        })
        .where(eq(preferences.userId, userId))
        .returning({
          [category]: preferences[category],
        });

      if (!result[0]) {
        return notFound('Preferences not found');
      }

      const updatedData = (result[0]?.[category] as Record<string, unknown>) || {};

      // Apply defaults in response
      if (category === 'notifications') {
        return ok(applyNotificationDefaults(updatedData));
      }
      if (category === 'onboarding') {
        return ok(applyOnboardingDefaults(updatedData));
      }

      return ok(updatedData);
    } catch (error) {
      logger.error('Failed to update preferences category {category} for user {userId}: {error}', {
        userId,
        category,
        error,
      });
      return internalError(`Failed to update ${category} preferences`);
    }
  },

  /**
   * Initialize preferences for a new user
   */
  async initializeUserPreferences(userId: string): Promise<Result<Preferences>> {
    try {
      const existing = await db
        .select()
        .from(preferences)
        .where(eq(preferences.userId, userId))
        .limit(1);

      if (existing[0]) {
        return ok(existing[0]);
      }

      const [inserted] = await db
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

      if (!inserted) {
        return internalError(`Failed to create preferences for user ${userId}`);
      }

      return ok(inserted);
    } catch (error) {
      logger.error('Failed to initialize preferences for user {userId}: {error}', { userId, error });
      return internalError('Failed to initialize preferences');
    }
  },
};

export default preferencesService;

// Legacy exports
export const getPreferences = preferencesService.getPreferences;
export const getPreferencesByCategory = preferencesService.getPreferencesByCategory;
export const updatePreferencesByCategory = preferencesService.updatePreferencesByCategory;
export const initializeUserPreferences = preferencesService.initializeUserPreferences;
