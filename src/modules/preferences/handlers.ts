/**
 * Preferences HTTP Handlers
 *
 * HTTP route handlers for preferences API endpoints
 */

import type { Context } from 'hono';
import { preferencesService } from './services/preferences.service';
import type { PreferenceCategory } from '@/modules/preferences/types/preferences.types';
import { getServiceContext } from '@/shared/types/service-context';
import { response } from '@/shared/utils/responseUtils';

/**
 * GET /api/preferences - Get all preferences
 */
const getAllPreferences = async (c: Context) => {
  const ctx = getServiceContext(c);
  const result = await preferencesService.getPreferences(ctx);
  return response.fromResult(c, result);
};

/**
 * GET /api/preferences/:category - Get preferences by category
 */
const getCategoryPreferences = async (c: Context) => {
  const ctx = getServiceContext(c);
  const category = c.req.param('category') as PreferenceCategory;
  const result = await preferencesService.getPreferencesByCategory(category, ctx);
  return response.fromResult(c, result);
};

/**
 * PUT /api/preferences/:category - Update preferences by category
 */
const updateCategoryPreferences = async (c: Context) => {
  const ctx = getServiceContext(c);
  const category = c.req.param('category') as PreferenceCategory;
  const validatedBody = c.get('validatedBody');

  const result = await preferencesService.updatePreferencesByCategory(
    category,
    validatedBody as Record<string, unknown>,
    ctx,
  );

  return response.fromResult(c, result);
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
