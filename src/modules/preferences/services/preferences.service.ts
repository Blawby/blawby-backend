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
 * Get all preferences for a user.
 *
 * "User has never set any preferences" is a normal, valid state for any new
 * user — not an error. Return defaults (with empty per-category objects)
 * instead of 404 so the frontend can render account/settings pages cleanly.
 *
 * Pre-fix, the frontend's AccountPage saw the 404 as a thrown HttpError, and
 * an effect's dep churn re-fired the GET → re-threw → re-rendered, producing
 * a 260+ console-error render loop on the Account settings page for any new
 * user. See blawby-ai-chatbot PR #581 audit (U9) and CLAUDE.md "fix the API
 * contract / source of truth first".
 */
const getPreferences = async (ctx: ServiceContext): Promise<Preferences> => {
  // CASL Check — verify the user can read preferences
  ForbiddenError.from(ctx.ability).throwUnlessCan('read', 'UserPreferences');

  const [prefs] = await db.select().from(preferences).where(eq(preferences.user_id, ctx.userId)).limit(1);

  if (!prefs) {
    // Synthetic "no row yet" response. `id` is a stable per-call UUID so
    // the response satisfies the Preferences type without lying about
    // persistence. Callers should not rely on `id` when there's no row;
    // they get one once they PUT to any category.
    const now = new Date();
    const defaultRow: Preferences = {
      id: '00000000-0000-0000-0000-000000000000',
      user_id: ctx.userId,
      general: {},
      notifications: applyNotificationDefaults(null),
      security: {},
      account: {},
      onboarding: applyOnboardingDefaults(null),
      organization_id: null,
      organization: null,
      product_usage: null,
      created_at: now,
      updated_at: now,
    };
    return defaultRow;
  }

  // Apply defaults to notifications and onboarding fields
  return {
    ...prefs,
    notifications: applyNotificationDefaults(prefs.notifications),
    onboarding: applyOnboardingDefaults(prefs.onboarding),
  };
};

/**
 * Get preferences by category.
 *
 * Returns the category's empty/default shape when the user has no preferences
 * row yet (a valid empty state, not an error). See `getPreferences` above for
 * the rationale.
 */
const getPreferencesByCategory = async (
  category: PreferenceCategory,
  ctx: ServiceContext
): Promise<Record<string, unknown>> => {
  // CASL Check — verify the user can read preferences
  ForbiddenError.from(ctx.ability).throwUnlessCan('read', 'UserPreferences');

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
    // No preferences row yet for this user. Return defaults so account/
    // settings UI renders correctly for a brand-new user.
    if (category === 'notifications') {
      return applyNotificationDefaults(null);
    }
    if (category === 'onboarding') {
      return applyOnboardingDefaults(null);
    }
    return {};
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

  // 1. CASL Check — verify the user can update preferences before any DB access
  ForbiddenError.from(ctx.ability).throwUnlessCan('update', 'UserPreferences');

  // 2. Fetch current preferences for ownership verification
  const [current] = await db.select().from(preferences).where(eq(preferences.user_id, ctx.userId)).limit(1);

  if (!current) {
    throw new HTTPException(404, { message: 'Preference not found' });
  }

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
