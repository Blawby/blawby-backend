/**
 * Preferences HTTP App
 *
 * Hono app for preferences API endpoints
 */

import { preferencesHandlers } from './handlers';
import * as routes from './routes';
import { injectAbility } from '@/shared/middleware/inject-ability';
import { requireAuth } from '@/shared/middleware/requireAuth';
import { createHonoApp } from '@/shared/router/factory';

const app = createHonoApp();

// Apply auth and CASL ability injection to all routes in this module.
app.use('*', requireAuth(), injectAbility());

/**
 * Preferences Routes
 * Using app.openapi for typed routes and automatic documentation
 */

// GET /api/preferences - Get all preferences
app.openapi(routes.getAllPreferencesRoute, preferencesHandlers.getAllPreferences);

// GET /api/preferences/:category - Get preferences by category
app.openapi(routes.getCategoryPreferencesRoute, preferencesHandlers.getCategoryPreferences);

// PUT /api/preferences/:category - Update preferences by category
app.openapi(routes.updateCategoryPreferencesRoute, preferencesHandlers.updateCategoryPreferences);

export default app;
