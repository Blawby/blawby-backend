import * as handlers from '@/modules/practice/handlers';
import { routes } from '@/modules/practice/routes';
import { injectAbility } from '@/shared/middleware/inject-ability';
import { createHonoApp } from '@/shared/router/factory';
import { registerOpenApiRoutes } from '@/shared/router/openapi-docs';

const practiceApp = createHonoApp();

practiceApp.use('*', injectAbility());

/**
 * GET /api/practice/list
 * List all practices for the authenticated user
 */
practiceApp.openapi(routes.listPracticesRoute, handlers.listPracticesHandler);

/**
 * POST /api/practice
 * Create a new practice
 */
practiceApp.openapi(routes.createPracticeRoute, handlers.createPracticeHandler);

/**
 * GET /api/practice/:uuid
 * Get practice by ID
 */
practiceApp.openapi(routes.getPracticeByIdRoute, handlers.getPracticeHandler);

/**
 * PUT /api/practice/:uuid
 * Update practice
 */
practiceApp.openapi(routes.updatePracticeRoute, handlers.updatePracticeHandler);

/**
 * DELETE /api/practice/:uuid
 * Delete practice
 */
practiceApp.openapi(routes.deletePracticeRoute, handlers.deletePracticeHandler);

/**
 * PUT /api/practice/:uuid/active
 * Set practice as active
 */
practiceApp.openapi(routes.setActivePracticeRoute, handlers.setActivePracticeHandler);

/**
 * GET /api/practice/:uuid/details
 * Get practice details
 */
practiceApp.openapi(routes.getPracticeDetailsRoute, handlers.getPracticeDetailsHandler);

/**
 * POST /api/practice/:uuid/details
 * Create practice details
 */
practiceApp.openapi(routes.createPracticeDetailsRoute, handlers.createPracticeDetailsHandler);

/**
 * PUT /api/practice/:uuid/details
 * Update practice details
 */
practiceApp.openapi(routes.updatePracticeDetailsRoute, handlers.updatePracticeDetailsHandler);

/**
 * DELETE /api/practice/:uuid/details
 * Delete practice details
 */
practiceApp.openapi(routes.deletePracticeDetailsRoute, handlers.deletePracticeDetailsHandler);

/**
 * GET /api/practice/details/:slug
 * Get practice details by slug
 */
practiceApp.openapi(routes.getPracticeDetailsBySlugRoute, handlers.getPracticeDetailsBySlugHandler);

/**
 * POST /api/practice/:practice_id/conflict-check
 * Run fuzzy conflict check against existing matters and clients
 */
practiceApp.openapi(routes.conflictCheckRoute, handlers.conflictCheckHandler);

registerOpenApiRoutes(practiceApp, routes);

export default practiceApp;
