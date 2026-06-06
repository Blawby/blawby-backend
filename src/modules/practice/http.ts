import * as handlers from '@/modules/practice/handlers';
import { routes } from '@/modules/practice/routes';
import { injectAbility } from '@/shared/middleware/inject-ability';
import { requireAuth } from '@/shared/middleware/requireAuth';
import { requireOrgMembership } from '@/shared/middleware/requireOrgMembership';
import { createHonoApp } from '@/shared/router/factory';
import { registerOpenApiRoutes } from '@/shared/router/openapi-docs';

const practiceApp = createHonoApp();

const publicApp = createHonoApp();
publicApp.use('*', injectAbility());
publicApp.openapi(routes.getPracticeDetailsBySlugRoute, handlers.getPracticeDetailsBySlugHandler);

const authApp = createHonoApp();
authApp.use('*', requireAuth(), injectAbility());

/**
 * GET /api/practice/list
 * List all practices for the authenticated user
 */
authApp.openapi(routes.listPracticesRoute, handlers.listPracticesHandler);

/**
 * POST /api/practice
 * Create a new practice
 */
authApp.openapi(routes.createPracticeRoute, handlers.createPracticeHandler);

const staffApp = createHonoApp();
staffApp.use('*', requireAuth(), requireOrgMembership(), injectAbility());

/**
 * GET /api/practice/:uuid
 * Get practice by ID
 */
staffApp.openapi(routes.getPracticeByIdRoute, handlers.getPracticeHandler);

/**
 * PUT /api/practice/:uuid
 * Update practice
 */
staffApp.openapi(routes.updatePracticeRoute, handlers.updatePracticeHandler);

/**
 * DELETE /api/practice/:uuid
 * Delete practice
 */
staffApp.openapi(routes.deletePracticeRoute, handlers.deletePracticeHandler);

/**
 * PUT /api/practice/:uuid/active
 * Set practice as active
 */
staffApp.openapi(routes.setActivePracticeRoute, handlers.setActivePracticeHandler);

/**
 * GET /api/practice/:uuid/details
 * Get practice details
 */
staffApp.openapi(routes.getPracticeDetailsRoute, handlers.getPracticeDetailsHandler);

/**
 * POST /api/practice/:uuid/details
 * Create practice details
 */
staffApp.openapi(routes.createPracticeDetailsRoute, handlers.createPracticeDetailsHandler);

/**
 * PUT /api/practice/:uuid/details
 * Update practice details
 */
staffApp.openapi(routes.updatePracticeDetailsRoute, handlers.updatePracticeDetailsHandler);

/**
 * DELETE /api/practice/:uuid/details
 * Delete practice details
 */
staffApp.openapi(routes.deletePracticeDetailsRoute, handlers.deletePracticeDetailsHandler);

/**
 * POST /api/practice/:practice_id/conflict-check
 * Run fuzzy conflict check against existing matters and clients
 */
staffApp.openapi(routes.conflictCheckRoute, handlers.conflictCheckHandler);

// ==================== INTAKE TEMPLATES ====================
staffApp.openapi(routes.listIntakeTemplatesRoute, handlers.listIntakeTemplatesHandler);
staffApp.openapi(routes.createIntakeTemplateRoute, handlers.createIntakeTemplateHandler);
staffApp.openapi(routes.getIntakeTemplateRoute, handlers.getIntakeTemplateHandler);
staffApp.openapi(routes.updateIntakeTemplateRoute, handlers.updateIntakeTemplateHandler);
staffApp.openapi(routes.deleteIntakeTemplateRoute, handlers.deleteIntakeTemplateHandler);

practiceApp.route('/', publicApp);
practiceApp.route('/', authApp);
practiceApp.route('/', staffApp);

/**
 * GET /api/practice/:practice_id/members/:user_id/profile
 * Get a member's routing/capacity metadata
 */
practiceApp.openapi(routes.getMemberProfileRoute, handlers.getMemberProfileHandler);

/**
 * PUT /api/practice/:practice_id/members/:user_id/profile
 * Upsert a member's routing/capacity metadata
 */
practiceApp.openapi(routes.updateMemberProfileRoute, handlers.updateMemberProfileHandler);

registerOpenApiRoutes(practiceApp, routes);

export default practiceApp;
