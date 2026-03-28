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
import type { Result } from '@/shared/types/result';
import type { ServiceContext } from '@/shared/types/service-context';
import { badRequest, internalError, notFound, ok } from '@/shared/utils/result';

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
const getPreferences = async (ctx: ServiceContext): Promise<Result<Preferences>> => {
  const [prefs] = await db.select().from(preferences).where(eq(preferences.user_id, ctx.userId)).limit(1);

  if (!prefs) {
    return notFound('Preference not found');
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
  ctx: ServiceContext
): Promise<Result<Record<string, unknown>>> => {
  if (category === 'profile') {
    return ok({});
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
    return notFound('Preference not found');
  }

  // CASL Check — verify the user can read preferences
  ForbiddenError.from(ctx.ability).throwUnlessCan('read', 'OrganizationPreferences');

  const categoryData = toRecord(row?.[category]);

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
  ctx: ServiceContext
): Promise<Result<Record<string, unknown>>> => {
  if (category === 'profile') {
    return badRequest('Profile fields should be updated via Better Auth updateUser endpoint');
  }

  // 1. Fetch current preferences for ownership verification
  const [current] = await db.select().from(preferences).where(eq(preferences.user_id, ctx.userId)).limit(1);

  if (!current) {
    return notFound('Preference not found');
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
    return notFound('Preference not found');
  }

  const updatedData = toRecord(result[0][category]);

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
  const existing = await db.select().from(preferences).where(eq(preferences.user_id, userId)).limit(1);

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
    return internalError('Failed to create preferences');
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
