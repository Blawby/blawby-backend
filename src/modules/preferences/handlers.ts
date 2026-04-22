/**
 * Preferences HTTP Handlers
 *
 * HTTP route handlers for preferences API endpoints
 */

import type { Context } from 'hono';
import { preferencesService } from './services/preferences.service';
import { PREFERENCE_CATEGORIES, type PreferenceCategory } from '@/modules/preferences/types/preferences.types';
import { preferenceValidations } from '@/modules/preferences/validations/preferences.validation';
import { getServiceContext } from '@/shared/types/service-context';

/**
 * Type guard to validate preference category
 */
const isValidPreferenceCategory = (category: string): category is PreferenceCategory =>
  PREFERENCE_CATEGORIES.some((value) => value === category);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const isValidCategoryPayload = (category: PreferenceCategory, payload: unknown): payload is Record<string, unknown> => {
  if (!isRecord(payload)) {
    return false;
  }

  switch (category) {
    case 'general':
      return preferenceValidations.generalPreferencesSchema.safeParse(payload).success;
    case 'notifications':
      return preferenceValidations.notificationPreferencesSchema.safeParse(payload).success;
    case 'security':
      return preferenceValidations.securityPreferencesSchema.safeParse(payload).success;
    case 'account':
      return preferenceValidations.accountPreferencesSchema.safeParse(payload).success;
    case 'onboarding':
      return preferenceValidations.onboardingPreferencesSchema.safeParse(payload).success;
    case 'profile':
      return preferenceValidations.profilePreferencesSchema.safeParse(payload).success;
    default:
      return false;
  }
};

/**
 * GET /api/preferences - Get all preferences
 */
const getAllPreferences = async (c: Context) => {
  const ctx = getServiceContext(c);
  const result = await preferencesService.getPreferences(ctx);
  return c.json(result);
};

/**
 * GET /api/preferences/:category - Get preferences by category
 */
const getCategoryPreferences = async (c: Context) => {
  const ctx = getServiceContext(c);
  const categoryParam = c.req.param('category');

  // Validate category exists and is one of the allowed values
  if (!categoryParam || !isValidPreferenceCategory(categoryParam)) {
    return c.json({ error: 'Invalid category' }, 400);
  }

  const result = await preferencesService.getPreferencesByCategory(categoryParam, ctx);
  return c.json(result);
};

/**
 * PUT /api/preferences/:category - Update preferences by category
 */
const updateCategoryPreferences = async (c: Context) => {
  const ctx = getServiceContext(c);
  const categoryParam = c.req.param('category');
  const validatedBody = (await c.req.json()) as unknown;

  // Validate category exists and is one of the allowed values
  if (!categoryParam || !isValidPreferenceCategory(categoryParam)) {
    return c.json({ error: 'Invalid category' }, 400);
  }

  if (!isValidCategoryPayload(categoryParam, validatedBody)) {
    return c.json({ error: 'Invalid preferences payload' }, 400);
  }

  const result = await preferencesService.updatePreferencesByCategory(categoryParam, validatedBody, ctx);

  return c.json(result);
};

/**
 * Preferences Handlers
 */
export const preferencesHandlers = {
  getAllPreferences,
  getCategoryPreferences,
  updateCategoryPreferences,
};

export default preferencesHandlers;
