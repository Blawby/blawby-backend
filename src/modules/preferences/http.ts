/**
 * Preferences HTTP App
 *
 * Hono app for preferences API endpoints
 */

import { OpenAPIHono } from '@hono/zod-openapi';
import {
  getAllPreferences,
  getCategoryPreferences,
  updateCategoryPreferences,
  getDetails,
  updateDetails,
} from '@/modules/preferences/handlers';
import * as routes from '@/modules/preferences/routes';
import {
  generalPreferencesSchema,
  notificationPreferencesSchema,
  securityPreferencesSchema,
  accountPreferencesSchema,
  onboardingPreferencesSchema,
  profilePreferencesSchema,
  preferenceCategorySchema,
  updateUserDetailsSchema,
} from '@/modules/preferences/validations/preferences.validation';
import { registerOpenApiRoutes } from '@/shared/router/openapi-docs';
import { validateJson } from '@/shared/middleware/validation';
import type { AppContext } from '@/shared/types/hono';

const app = new OpenAPIHono<AppContext>();

// GET /api/preferences - Get all preferences
app.get('/', getAllPreferences);

// GET /api/preferences/:category - Get preferences by category
app.get('/:category', getCategoryPreferences);

// PUT /api/preferences/:category - Update preferences by category
app.put(
  '/:category',
  async (c, next) => {
    const category = c.req.param('category');
    const categoryResult = preferenceCategorySchema.safeParse(category);

    if (!categoryResult.success) {
      return c.json({ error: 'Invalid category' }, 400);
    }

    // Select validation schema based on category
    let schema;
    switch (categoryResult.data) {
      case 'general':
        schema = generalPreferencesSchema;
        break;
      case 'notifications':
        schema = notificationPreferencesSchema;
        break;
      case 'security':
        schema = securityPreferencesSchema;
        break;
      case 'account':
        schema = accountPreferencesSchema;
        break;
      case 'onboarding':
        schema = onboardingPreferencesSchema;
        break;
      case 'profile':
        schema = profilePreferencesSchema;
        break;
      default:
        return c.json({ error: 'Invalid category' }, 400);
    }

    return validateJson(schema, `Invalid ${category} preferences data`)(c as any, next);
  },
  updateCategoryPreferences,
);

// Legacy endpoints for backward compatibility (not documented in OpenAPI)
app.get('/me', getDetails);
app.put(
  '/me',
  validateJson(
    updateUserDetailsSchema,
    'Invalid preferences data',
  ),
  updateDetails,
);

registerOpenApiRoutes(app, routes);

export default app;

