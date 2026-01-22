/**
 * Preferences HTTP Handlers
 *
 * HTTP route handlers for preferences API endpoints
 */

import type { Context } from 'hono';
import { preferencesService } from './services/preferences.service';
import { response } from '@/shared/utils/responseUtils';
import type { PreferenceCategory } from '@/modules/preferences/types/preferences.types';

/**
 * GET /api/preferences - Get all preferences
 */
export const getAllPreferences = async (c: Context) => {
  const user = c.get('user')!; // Auth middleware guarantees user is non-null
  const result = await preferencesService.getPreferences(user.id);
  return response.fromResult(c, result);
};

/**
 * GET /api/preferences/:category - Get preferences by category
 */
export const getCategoryPreferences = async (c: Context) => {
  const user = c.get('user')!;
  const category = c.req.param('category') as PreferenceCategory;
  const result = await preferencesService.getPreferencesByCategory(user.id, category);
  return response.fromResult(c, result);
};

/**
 * PUT /api/preferences/:category - Update preferences by category
 */
export const updateCategoryPreferences = async (c: Context) => {
  const user = c.get('user')!;
  const category = c.req.param('category') as PreferenceCategory;
  const validatedBody = c.get('validatedBody');

  const result = await preferencesService.updatePreferencesByCategory(
    user.id,
    category,
    validatedBody as Record<string, unknown>,
  );

  return response.fromResult(c, result);
};

/**
 * Legacy handlers for backward compatibility
 */
export const getDetails = getAllPreferences;
export const updateDetails = async (c: Context) => {
  // Legacy endpoint - update profile category
  return updateCategoryPreferences(c);
};
