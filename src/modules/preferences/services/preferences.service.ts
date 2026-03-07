/**
 * Preferences Service
 *
 * Service layer for preferences operations
 * Handles category-based preference updates
 */

import { ForbiddenError } from '@casl/ability';
import { getLogger } from '@logtape/logtape';
import { eq } from 'drizzle-orm';
import { preferences } from '@/modules/preferences/schema/preferences.schema';
import type { Preferences } from '@/modules/preferences/schema/preferences.schema';
import type {
  NotificationPreferences,
  OnboardingPreferences,
  PreferenceCategory,
} from '@/modules/preferences/types/preferences.types';
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  DEFAULT_ONBOARDING_PREFERENCES,
} from '@/modules/preferences/types/preferences.types';
import { db } from '@/shared/database';
import type { Result } from '@/shared/types/result';
import type { ServiceContext } from '@/shared/types/service-context';
import { badRequest, ok } from '@/shared/utils/result';

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
  const storedPrefs = (stored as unknown as NotificationPreferences) || {};
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
  const storedPrefs = (stored as unknown as OnboardingPreferences) || {};
  return {
    ...DEFAULT_ONBOARDING_PREFERENCES,
    ...storedPrefs,
  };
};

/**
 * Get all preferences for a user
 */
const getPreferences = async (ctx: ServiceContext): Promise<Result<Preferences>> => {
  const result = await db
    .select()
    .from(preferences)
    .where(eq(preferences.user_id, ctx.userId))
    .limit(1);

  const prefs = result[0];
  if (!prefs) {
    throw new Error('Preferences not found');
  }

  // CASL Check — verify the user can read preferences
  ForbiddenError.from(ctx.ability).throwUnlessCan('read', 'OrganizationPreferences');

  // Apply defaults to notifications and onboarding fields
  return ok({
    ...prefs,
    notifications: applyNotificationDefaults(prefs.notifications),
    onboarding: applyOnboardingDefaults(prefs.onboarding),
  });
};

/**
 * Get preferences by category
 */
const getPreferencesByCategory = async (
  category: PreferenceCategory,
  ctx: ServiceContext,
): Promise<Result<Record<string, unknown>>> => {
  if (category === 'profile') {
    return ok({});
  }

  const result = await db
    .select({
      [category]: preferences[category],
      user_id: preferences.user_id,
    })
    .from(preferences)
    .where(eq(preferences.user_id, ctx.userId))
    .limit(1);

  const row = result[0];
  if (!row) {
    throw new Error('Preferences not found');
  }

  // CASL Check — verify the user can read preferences
  ForbiddenError.from(ctx.ability).throwUnlessCan('read', 'OrganizationPreferences');

  const categoryData = (row?.[category] as Record<string, unknown>) || {};

  // Apply defaults for specific categories
  if (category === 'notifications') {
    return ok(applyNotificationDefaults(categoryData));
  }
  if (category === 'onboarding') {
    return ok(applyOnboardingDefaults(categoryData));
  }

  return ok(categoryData);
};

/**
 * Update preferences by category
 */
const updatePreferencesByCategory = async (
  category: PreferenceCategory,
  data: Record<string, unknown>,
  ctx: ServiceContext,
): Promise<Result<Record<string, unknown>>> => {
  if (category === 'profile') {
    return badRequest('Profile fields should be updated via Better Auth updateUser endpoint');
  }

  // 1. Fetch current preferences for ownership verification
  const currentResult = await db
    .select()
    .from(preferences)
    .where(eq(preferences.user_id, ctx.userId))
    .limit(1);

  const current = currentResult[0];
  if (!current) {
    throw new Error('Preferences not found');
  }

  // 2. CASL Check — verify the user can update preferences
  ForbiddenError.from(ctx.ability).throwUnlessCan('update', 'OrganizationPreferences');

  // Handle notifications category with special logic
  let dataToUpdate = data;
  if (category === 'notifications') {
    const existingData = (current.notifications as Record<string, unknown>) || {};
    // Merge with incoming data (partial update)
    const merged = { ...existingData, ...data };
    // Force system fields always true
    merged.system_push = true;
    merged.system_email = true;
    dataToUpdate = merged;
  }

  const result = await db
    .update(preferences)
    .set({
      [category]: dataToUpdate,
      updated_at: new Date(),
    })
    .where(eq(preferences.user_id, ctx.userId))
    .returning({
      [category]: preferences[category],
    });

  const updatedData = (result[0]?.[category] as Record<string, unknown>) || {};

  // Apply defaults in response
  if (category === 'notifications') {
    return ok(applyNotificationDefaults(updatedData));
  }
  if (category === 'onboarding') {
    return ok(applyOnboardingDefaults(updatedData));
  }

  return ok(updatedData);
};

/**
 * Initialize preferences for a new user
 */
const initializeUserPreferences = async (userId: string): Promise<Result<Preferences>> => {
  const existing = await db
    .select()
    .from(preferences)
    .where(eq(preferences.user_id, userId))
    .limit(1);

  if (existing[0]) {
    return ok(existing[0]);
  }

  const [inserted] = await db
    .insert(preferences)
    .values({
      user_id: userId,
      notifications: DEFAULT_NOTIFICATION_PREFERENCES,
      general: {},
      security: {},
      account: {},
      onboarding: DEFAULT_ONBOARDING_PREFERENCES,
    })
    .returning();

  if (!inserted) {
    throw new Error(`Failed to create preferences for user ${userId}`);
  }

  return ok(inserted);
};

/**
 * Preferences Service
 */
export const preferencesService = {
  getPreferences,
  getPreferencesByCategory,
  updatePreferencesByCategory,
  initializeUserPreferences,
};

export default preferencesService;
