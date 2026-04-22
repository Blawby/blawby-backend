/**
 * Preferences HTTP Handlers
 *
 * HTTP route handlers for preferences API endpoints
 */

import { z } from '@hono/zod-openapi';
import type { Context } from 'hono';
import { preferencesService } from './services/preferences.service';
import { PREFERENCE_CATEGORIES, type PreferenceCategory } from '@/modules/preferences/types/preferences.types';
import { preferenceValidations } from '@/modules/preferences/validations/preferences.validation';
import { getServiceContext } from '@/shared/types/service-context';
import { validator } from '@/shared/validations/hono-validation';

const isValidPreferenceCategory = (category: string): category is PreferenceCategory =>
  PREFERENCE_CATEGORIES.some((value) => value === category);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const parseCategoryPayload = (category: PreferenceCategory, payload: unknown): Record<string, unknown> | null => {
  if (!isRecord(payload)) return null;

  switch (category) {
    case 'general': {
      const result = preferenceValidations.generalPreferencesSchema.safeParse(payload);
      return result.success ? result.data : null;
    }
    case 'notifications': {
      const result = preferenceValidations.notificationPreferencesSchema.safeParse(payload);
      return result.success ? result.data : null;
    }
    case 'security': {
      const result = preferenceValidations.securityPreferencesSchema.safeParse(payload);
      return result.success ? result.data : null;
    }
    case 'account': {
      const result = preferenceValidations.accountPreferencesSchema.safeParse(payload);
      return result.success ? result.data : null;
    }
    case 'onboarding': {
      const result = preferenceValidations.onboardingPreferencesSchema.safeParse(payload);
      return result.success ? result.data : null;
    }
    case 'profile': {
      const result = preferenceValidations.profilePreferencesSchema.safeParse(payload);
      return result.success ? result.data : null;
    }
    default:
      return null;
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

  if (!categoryParam || !isValidPreferenceCategory(categoryParam)) {
    return c.json({ error: 'Invalid category' }, 400);
  }

  const rawBody = await validator.validateBody(c, z.record(z.string(), z.unknown()));
  const parsed = parseCategoryPayload(categoryParam, rawBody);

  if (!parsed) {
    return c.json({ error: 'Invalid preferences payload' }, 400);
  }

  const result = await preferencesService.updatePreferencesByCategory(categoryParam, parsed, ctx);
  return c.json(result);
};

export const preferencesHandlers = {
  getAllPreferences,
  getCategoryPreferences,
  updateCategoryPreferences,
};
