/**
 * Preferences HTTP Handlers
 *
 * HTTP route handlers for preferences API endpoints
 */

import type { Context } from 'hono';
import {
  getPreferences,
  getPreferencesByCategory,
  updatePreferencesByCategory,
} from './services/preferences.service';
import { response } from '@/shared/utils/responseUtils';
import type { PreferenceCategory } from './schema/preferences.schema';

/**
 * GET /api/preferences - Get all preferences
 */
export const getAllPreferences = async (c: Context) => {
  try {
    const user = c.get('user')!; // Auth middleware guarantees user is non-null

    const preferences = await getPreferences(user.id);

    if (!preferences) {
      return response.notFound(c, 'Preferences not found');
    }

    return response.ok(c, { data: preferences });
  } catch (error) {
    console.error('Error getting preferences:', error);
    return response.internalServerError(c, 'Internal server error');
  }
};

/**
 * GET /api/preferences/:category - Get preferences by category
 */
export const getCategoryPreferences = async (c: Context) => {
  try {
    const user = c.get('user')!;
    const category = c.req.param('category') as PreferenceCategory;

    const categoryData = await getPreferencesByCategory(user.id, category);

    return response.ok(c, { data: categoryData });
  } catch (error) {
    console.error('Error getting category preferences:', error);
    return response.internalServerError(c, 'Internal server error');
  }
};

/**
 * PUT /api/preferences/:category - Update preferences by category
 */
export const updateCategoryPreferences = async (c: Context) => {
  try {
    const user = c.get('user')!;
    const category = c.req.param('category') as PreferenceCategory;
    const validatedBody = c.get('validatedBody');

    const updated = await updatePreferencesByCategory(
      user.id,
      category,
      validatedBody as Record<string, unknown>,
    );

    return response.ok(c, { data: updated });
  } catch (error) {
    console.error('Error updating category preferences:', error);
    return response.internalServerError(c, 'Internal server error');
  }
};

/**
 * Legacy handlers for backward compatibility
 */
export const getDetails = getAllPreferences;
export const updateDetails = async (c: Context) => {
  // Legacy endpoint - update profile category
  return updateCategoryPreferences(c);
};

