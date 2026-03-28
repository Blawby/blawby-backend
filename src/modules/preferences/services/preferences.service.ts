/**
 * Preferences Service
 *
 * Service layer for preferences operations
 * Handles category-based preference updates
 */

import { ForbiddenError } from '@casl/ability';
import { eq } from 'drizzle-orm';
import { type Preferences, preferences } from '@/modules/preferences/schema/preferences.schema';
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  DEFAULT_ONBOARDING_PREFERENCES,
  type NotificationPreferences,
  type OnboardingPreferences,
  type PreferenceCategory,
} from '@/modules/preferences/types/preferences.types';
import { preferenceValidations } from '@/modules/preferences/validations/preferences.validation';
import { db } from '@/shared/database';
import type { ServiceContext } from '@/shared/types/service-context';
import { HTTPException } from 'hono/http-exception';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const toRecord = (value: unknown): Record<string, unknown> => (isRecord(value) ? value : {});

/**
 * Apply default values to notification preferences
 */
const applyNotificationDefaults = (stored: Record<string, unknown> | null | undefined): NotificationPreferences => {
  const parsed = preferenceValidations.notificationPreferencesSchema.safeParse(stored ?? {});
  const storedPrefs = parsed.success ? parsed.data : {};
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
const applyOnboardingDefaults = (stored: Record<string, unknown> | null | undefined): OnboardingPreferences => {
  const parsed = preferenceValidations.onboardingPreferencesSchema.safeParse(stored ?? {});
  const storedPrefs = parsed.success ? parsed.data : {};
  return {
    ...DEFAULT_ONBOARDING_PREFERENCES,
    ...storedPrefs,
  };
};

/**
 * Get all preferences for a user
 */
const getPreferences = async (ctx: ServiceContext): Promise<Preferences> => {
  // CASL Check — verify the user can read preferences
  ForbiddenError.from(ctx.ability).throwUnlessCan('read', 'OrganizationPreferences');

  const [prefs] = await db.select().from(preferences).where(eq(preferences.user_id, ctx.userId)).limit(1);

  if (!prefs) {
    throw new HTTPException(404, { message: 'Preference not found' });
  }

  // Apply defaults to notifications and onboarding fields
  return {
    ...prefs,
    notifications: applyNotificationDefaults(prefs.notifications),
    onboarding: applyOnboardingDefaults(prefs.onboarding),
  };
};

/**
 * Get preferences by category
 */
const getPreferencesByCategory = async (
  category: PreferenceCategory,
  ctx: ServiceContext
): Promise<Record<string, unknown>> => {
  // CASL Check — verify the user can read preferences
  ForbiddenError.from(ctx.ability).throwUnlessCan('read', 'OrganizationPreferences');

  if (category === 'profile') {
    return {};
  }

  const [row] = await db
    .select({
      [category]: preferences[category],
      user_id: preferences.user_id,
    })
    .from(preferences)
    .where(eq(preferences.user_id, ctx.userId))
    .limit(1);

  if (!row) {
    throw new HTTPException(404, { message: 'Preference not found' });
  }

  const categoryData = toRecord(row?.[category]);

  // Apply defaults for specific categories
  if (category === 'notifications') {
    return applyNotificationDefaults(categoryData);
  }
  if (category === 'onboarding') {
    return applyOnboardingDefaults(categoryData);
  }

  return categoryData;
};

/**
 * Update preferences by category
 */
const updatePreferencesByCategory = async (
  category: PreferenceCategory,
  data: Record<string, unknown>,
  ctx: ServiceContext
): Promise<Record<string, unknown>> => {
  if (category === 'profile') {
    throw new HTTPException(400, { message: 'Profile fields should be updated via Better Auth updateUser endpoint' });
  }

  // 1. Fetch current preferences for ownership verification
  const [current] = await db.select().from(preferences).where(eq(preferences.user_id, ctx.userId)).limit(1);

  if (!current) {
    throw new HTTPException(404, { message: 'Preference not found' });
  }

  // 2. CASL Check — verify the user can update preferences
  ForbiddenError.from(ctx.ability).throwUnlessCan('update', 'OrganizationPreferences');

  // Handle notifications category with special logic
  let dataToUpdate = data;
  if (category === 'notifications') {
    const existingData = toRecord(current.notifications);
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

  if (!result[0]) {
    throw new HTTPException(404, { message: 'Preference not found' });
  }

  const updatedData = toRecord(result[0][category]);

  // Apply defaults in response
  if (category === 'notifications') {
    return applyNotificationDefaults(updatedData);
  }
  if (category === 'onboarding') {
    return applyOnboardingDefaults(updatedData);
  }

  return updatedData;
};

/**
 * Initialize preferences for a new user
 */
const initializeUserPreferences = async (userId: string): Promise<Preferences> => {
  const existing = await db.select().from(preferences).where(eq(preferences.user_id, userId)).limit(1);

  if (existing[0]) {
    return existing[0];
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
    throw new HTTPException(500, { message: 'Failed to create preferences' });
  }

  return inserted;
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
