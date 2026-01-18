import { OpenAPIHono } from '@hono/zod-openapi';
import { z } from 'zod';
import * as routes from '@/modules/practice/routes';
import * as invitationsService from '@/modules/practice/services/invitations.service';
import * as membersService from '@/modules/practice/services/members.service';
import * as practiceService from '@/modules/practice/services/practice.service';
import * as practiceDetailsService from '@/modules/practice/services/practice-details.service';
import * as practiceValidations from '@/modules/practice/validations/practice.validation';
import { validateParams, validateJson, validateParamsAndJson } from '@/shared/middleware/validation';
import { registerOpenApiRoutes } from '@/shared/router/openapi-docs';
import type { AppContext } from '@/shared/types/hono';
import { response } from '@/shared/utils/responseUtils';

const practiceApp = new OpenAPIHono<AppContext>();

/**
 * GET /api/practice/list
 * List all practices for the authenticated user
 */
practiceApp.get('/list', async (c) => {
  const user = c.get('user')!;
  const result = await practiceService.listPractices(user, c.req.header());
  return response.fromResult(c, result);
});


/**
 * POST /api/practice
 * Create a new practice
 */
practiceApp.post('/', validateJson(practiceValidations.createPracticeSchema, 'Invalid Practice Data'), async (c) => {
  const user = c.get('user')!;
  const validatedBody = c.get('validatedBody');

  const result = await practiceService.createPracticeService({
    data: validatedBody,
    user,
    requestHeaders: c.req.header(),
  });
  return response.fromResult(c, result, 201);
});


/**
 * GET /api/practice/:uuid
 * Get practice by ID
 */
practiceApp.get('/:uuid', validateParams(practiceValidations.practiceIdParamSchema, 'Invalid Practice uuid'), async (c) => {
  const user = c.get('user')!;
  const { uuid } = c.get('validatedParams');

  const result = await practiceService.getPracticeById(uuid, user, c.req.header());
  return response.fromResult(c, result);
});


/**
 * PUT /api/practice/:uuid
 * Update practice
 */
practiceApp.put('/:uuid', validateParamsAndJson(
  practiceValidations.practiceIdParamSchema,
  practiceValidations.updatePracticeSchema,
  'Invalid Practice ID',
  'Invalid Practice Data',
), async (c) => {
  const user = c.get('user')!;
  const { uuid } = c.get('validatedParams');
  const validatedBody = c.get('validatedBody');

  const result = await practiceService.updatePracticeService(
    uuid,
    validatedBody,
    user,
    c.req.header(),
  );
  return response.fromResult(c, result);
});


/**
 * DELETE /api/practice/:uuid
 * Delete practice
 */
practiceApp.delete('/:uuid', validateParams(practiceValidations.practiceIdParamSchema, 'Invalid Practice ID'), async (c) => {
  const user = c.get('user')!;
  const { uuid } = c.get('validatedParams');

  const result = await practiceService.deletePracticeService(uuid, user, c.req.header());
  return response.fromResult(c, result, 204);
});


/**
 * PUT /api/practice/:uuid/active
 * Set practice as active
 */
practiceApp.put('/:uuid/active', validateParams(practiceValidations.practiceIdParamSchema, 'Invalid Practice ID'), async (c) => {
  const user = c.get('user')!;
  const { uuid } = c.get('validatedParams');

  const result = await practiceService.setActivePractice(uuid, user, c.req.header());
  return response.fromResult(c, result);
});


/**
 * GET /api/practice/:uuid/members
 * List all members of an organization
 */
practiceApp.get('/:uuid/members', validateParams(practiceValidations.practiceIdParamSchema, 'Invalid Practice ID'), async (c) => {
  const user = c.get('user')!;
  const { uuid } = c.get('validatedParams');

  const result = await membersService.listPracticeMembers(
    uuid,
    user,
    c.req.header(),
  );
  return response.fromResult(c, result);
});


/**
 * PATCH /api/practice/:uuid/members
 * Update a member's role
 */
practiceApp.patch('/:uuid/members', validateParamsAndJson(
  practiceValidations.practiceIdParamSchema,
  practiceValidations.updateMemberRoleSchema,
  'Invalid Practice ID',
  'Invalid Member Data',
), async (c) => {
  const user = c.get('user')!;
  const { uuid } = c.get('validatedParams');
  const validatedBody = c.get('validatedBody');

  const result = await membersService.updatePracticeMemberRole(
    uuid,
    validatedBody.member_id,
    validatedBody.role,
    user,
    c.req.header(),
  );
  return response.fromResult(c, result);
});


/**
 * DELETE /api/practice/:uuid/members/:userId
 * Remove a member from an organization
 */
const userIdParamSchema = practiceValidations.practiceIdParamSchema.extend({
  userId: z.uuid(), // Both user ID and organization ID are UUIDs
});

practiceApp.delete('/:uuid/members/:userId', validateParams(userIdParamSchema, 'Invalid Parameters'), async (c) => {
  const user = c.get('user')!;
  const { uuid, userId } = c.get('validatedParams');

  const result = await membersService.removePracticeMember(
    uuid,
    userId,
    user,
    c.req.header(),
  );
  return response.fromResult(c, result, 204);
});


/**
 * GET /api/practice/invitations
 * List all pending invitations for the current user
 */
practiceApp.get('/invitations', async (c) => {
  const user = c.get('user')!;

  const result = await invitationsService.listPracticeInvitations(
    user,
    c.req.header(),
  );
  return response.fromResult(c, result);
});


/**
 * POST /api/practice/:uuid/invitations
 * Create a new invitation for an organization
 */
practiceApp.post('/:uuid/invitations', validateParamsAndJson(
  practiceValidations.practiceIdParamSchema,
  practiceValidations.createInvitationSchema,
  'Invalid Practice ID',
  'Invalid Invitation Data',
), async (c) => {
  const user = c.get('user')!;
  const { uuid } = c.get('validatedParams');
  const validatedBody = c.get('validatedBody');

  const result = await invitationsService.createPracticeInvitation(
    uuid,
    validatedBody.email,
    validatedBody.role,
    user,
    c.req.header(),
  );
  return response.fromResult(c, result, 201);
});


/**
 * POST /api/practice/invitations/:invitationId/accept
 * Accept a pending invitation
 */
const invitationIdParamSchema = z.object({
  invitationId: z.string(),
});

practiceApp.post('/invitations/:invitationId/accept', validateParams(invitationIdParamSchema, 'Invalid Invitation ID'), async (c) => {
  const user = c.get('user')!;
  const { invitationId } = c.get('validatedParams');

  const result = await invitationsService.acceptPracticeInvitation(
    invitationId,
    user,
    c.req.header(),
  );
  return response.fromResult(c, result);
});


/**
 * GET /api/practice/:uuid/details
 * Get practice details
 */
practiceApp.get('/:uuid/details', validateParams(practiceValidations.practiceIdParamSchema, 'Invalid Practice UUID'), async (c) => {
  const user = c.get('user')!;
  const validatedParams = c.get('validatedParams');

  const result = await practiceDetailsService.getPracticeDetails(
    validatedParams.uuid,
    user,
    c.req.header(),
  );
  return response.fromResult(c, result);
});


/**
 * POST /api/practice/:uuid/details
 * Create practice details
 */
practiceApp.post('/:uuid/details', validateParamsAndJson(
  practiceValidations.practiceIdParamSchema,
  practiceValidations.createPracticeDetailsSchema,
  'Invalid Practice UUID',
  'Invalid Practice Details Data',
), async (c) => {
  const user = c.get('user')!;
  const validatedParams = c.get('validatedParams');
  const validatedBody = c.get('validatedBody');

  const result = await practiceDetailsService.upsertPracticeDetailsService(
    validatedParams.uuid,
    validatedBody,
    user,
    c.req.header(),
  );
  return response.fromResult(c, result, 201);
});


/**
 * PUT /api/practice/:uuid/details
 * Update practice details
 */
practiceApp.put('/:uuid/details', validateParamsAndJson(
  practiceValidations.practiceIdParamSchema,
  practiceValidations.updatePracticeDetailsSchema,
  'Invalid Practice UUID',
  'Invalid Practice Details Data',
), async (c) => {
  const user = c.get('user')!;
  const validatedParams = c.get('validatedParams');
  const validatedBody = c.get('validatedBody');

  const result = await practiceDetailsService.upsertPracticeDetailsService(
    validatedParams.uuid,
    validatedBody,
    user,
    c.req.header(),
  );
  return response.fromResult(c, result);
});


/**
 * DELETE /api/practice/:uuid/details
 * Delete practice details
 */
practiceApp.delete('/:uuid/details', validateParams(practiceValidations.practiceIdParamSchema, 'Invalid Practice UUID'), async (c) => {
  const user = c.get('user')!;
  const validatedParams = c.get('validatedParams');

  const result = await practiceDetailsService.deletePracticeDetailsService(
    validatedParams.uuid,
    user,
    c.req.header(),
  );
  return response.fromResult(c, result, 204);
});



practiceApp.get('/details/:slug', validateParams(practiceValidations.slugParamSchema, 'Invalid Slug'), async (c) => {
  const { slug } = c.get('validatedParams');
  const result = await practiceDetailsService.getPracticeDetailsBySlug(slug);
  return response.fromResult(c, result);
});

registerOpenApiRoutes(practiceApp, routes);

export default practiceApp;
