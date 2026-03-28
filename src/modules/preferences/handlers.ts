/**
 * Preferences HTTP Handlers
 *
 * HTTP route handlers for preferences API endpoints
 */

import type { Context } from 'hono';
import { preferencesService } from './services/preferences.service';
import { PREFERENCE_CATEGORIES, type PreferenceCategory } from '@/modules/preferences/types/preferences.types';
import { getServiceContext } from '@/shared/types/service-context';
import { sendResult } from '@/shared/utils/responseUtils';

/**
 * Type guard to validate preference category
 */
const isValidPreferenceCategory = (category: string): category is PreferenceCategory =>
  (PREFERENCE_CATEGORIES as readonly string[]).includes(category);

/**
 * GET /api/preferences - Get all preferences
 */
const getAllPreferences = async (c: Context) => {
  const ctx = getServiceContext(c);
  const result = await preferencesService.getPreferences(ctx);
  return sendResult(c, result);
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
  return sendResult(c, result);
};

/**
 * PUT /api/preferences/:category - Update preferences by category
 */
const updateCategoryPreferences = async (c: Context) => {
  const ctx = getServiceContext(c);
  const categoryParam = c.req.param('category');
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const validatedBody = c.get('validatedBody');

  // Validate category exists and is one of the allowed values
  if (!categoryParam || !isValidPreferenceCategory(categoryParam)) {
    return c.json({ error: 'Invalid category' }, 400);
  }

  const result = await preferencesService.updatePreferencesByCategory(
    categoryParam,
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    validatedBody as Record<string, unknown>,
    ctx
  );

  return sendResult(c, result);
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
