import { OpenAPIHono } from '@hono/zod-openapi';
import * as routes from '@/modules/practice/routes';
import * as handlers from '@/modules/practice/handlers';
import { registerOpenApiRoutes } from '@/shared/router/openapi-docs';
import type { AppContext } from '@/shared/types/hono';

import { createHonoApp } from '@/shared/router/factory';

const practiceApp = createHonoApp();

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
 * GET /api/practice/:uuid/members
 * List all members of an organization
 */
practiceApp.openapi(routes.listMembersRoute, handlers.listMembersHandler);

/**
 * PATCH /api/practice/:uuid/members
 * Update a member's role
 */
practiceApp.openapi(routes.updateMemberRoleRoute, handlers.updateMemberRoleHandler);

/**
 * DELETE /api/practice/:uuid/members/:userId
 * Remove a member from an organization
 */
practiceApp.openapi(routes.removeMemberRoute, handlers.removeMemberHandler);

/**
 * GET /api/practice/invitations
 * List all pending invitations for the current user
 */
practiceApp.openapi(routes.listInvitationsRoute, handlers.listInvitationsHandler);

/**
 * POST /api/practice/:uuid/invitations
 * Create a new invitation for an organization
 */
practiceApp.openapi(routes.createInvitationRoute, handlers.createInvitationHandler);

/**
 * POST /api/practice/invitations/:invitationId/accept
 * Accept a pending invitation
 */
practiceApp.openapi(routes.acceptInvitationRoute, handlers.acceptInvitationHandler);

/**
 * POST /api/practice/invitations/:invitationId/decline
 * Decline a pending invitation
 */
practiceApp.openapi(routes.declineInvitationRoute, handlers.declineInvitationHandler);

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

registerOpenApiRoutes(practiceApp, routes);

export default practiceApp;
