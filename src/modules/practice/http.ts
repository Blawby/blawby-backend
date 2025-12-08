import { OpenAPIHono } from '@hono/zod-openapi';
import { z } from 'zod';
import * as routes from '@/modules/practice/routes';
import * as invitationsService from '@/modules/practice/services/invitations.service';
import * as membersService from '@/modules/practice/services/members.service';
import * as practiceService from '@/modules/practice/services/practice.service';
import * as practiceValidations from '@/modules/practice/validations/practice.validation';
import { validateParams, validateJson, validateParamsAndJson } from '@/shared/middleware/validation';
import type { AppContext } from '@/shared/types/hono';
import { response } from '@/shared/utils/responseUtils';

const practiceApp = new OpenAPIHono<AppContext>();

/**
 * GET /api/practice/list
 * List all practices for the authenticated user
 */
practiceApp.get('/list', async (c) => {
  const user = c.get('user')!; // Auth middleware guarantees user is non-null
  const practices = await practiceService.listPractices(user, c.req.header());
  return response.ok(c, { practices });
});

// Register OpenAPI route for documentation only
practiceApp.openapi(routes.listPracticesRoute, async () => {
  throw new Error('This should never be called');
});

/**
 * POST /api/practice
 * Create a new practice
 */
practiceApp.post('/', validateJson(practiceValidations.createPracticeSchema, 'Invalid Practice Data'), async (c) => {
  const user = c.get('user')!; // Auth middleware guarantees user is non-null
  const validatedBody = c.get('validatedBody');

  const practice = await practiceService.createPracticeService({
    data: validatedBody,
    user,
    requestHeaders: c.req.header(),
  });
  return response.created(c, { practice });
});

// Register OpenAPI route for documentation only
practiceApp.openapi(routes.createPracticeRoute, async () => {
  throw new Error('This should never be called');
});

/**
 * GET /api/practice/:uuid
 * Get practice by ID
 */
practiceApp.get('/:uuid', validateParams(practiceValidations.practiceIdParamSchema, 'Invalid Practice uuid'), async (c) => {
  const user = c.get('user')!; // Auth middleware guarantees user is non-null
  const validatedParams = c.get('validatedParams');

  const practice = await practiceService.getPracticeById(validatedParams.uuid,
    user,
    c.req.header());
  return response.ok(c, { practice });
});

// Register OpenAPI route for documentation only
practiceApp.openapi(routes.getPracticeByIdRoute, async () => {
  throw new Error('This should never be called');
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
  const user = c.get('user')!; // Auth middleware guarantees user is non-null
  const validatedParams = c.get('validatedParams');
  const validatedBody = c.get('validatedBody');

  const practice = await practiceService.updatePracticeService(
    validatedParams.uuid,
    validatedBody,
    user,
    c.req.header(),
  );
  return response.ok(c, { practice });
});

// Register OpenAPI route for documentation only
practiceApp.openapi(routes.updatePracticeRoute, async () => {
  throw new Error('This should never be called');
});

/**
 * DELETE /api/practice/:uuid
 * Delete practice
 */
practiceApp.delete('/:uuid', validateParams(practiceValidations.practiceIdParamSchema, 'Invalid Practice ID'), async (c) => {
  const user = c.get('user')!; // Auth middleware guarantees user is non-null
  const validatedParams = c.get('validatedParams');

  await practiceService.deletePracticeService(validatedParams.uuid,
    user,
    c.req.header());
  return response.noContent(c);
});

// Register OpenAPI route for documentation only
practiceApp.openapi(routes.deletePracticeRoute, async () => {
  throw new Error('This should never be called');
});

/**
 * PUT /api/practice/:uuid/active
 * Set practice as active
 */
practiceApp.put('/:uuid/active', validateParams(practiceValidations.practiceIdParamSchema, 'Invalid Practice ID'), async (c) => {
  const user = c.get('user')!; // Auth middleware guarantees user is non-null
  const validatedParams = c.get('validatedParams');

  const result = await practiceService.setActivePractice(validatedParams.uuid,
    user,
    c.req.header());
  return response.ok(c, { result });
});

// Register OpenAPI route for documentation only
practiceApp.openapi(routes.setActivePracticeRoute, async () => {
  throw new Error('This should never be called');
});

/**
 * GET /api/practice/:uuid/members
 * List all members of an organization
 */
practiceApp.get('/:uuid/members', validateParams(practiceValidations.practiceIdParamSchema, 'Invalid Practice ID'), async (c) => {
  const user = c.get('user')!;
  const validatedParams = c.get('validatedParams');

  const result = await membersService.listPracticeMembers(
    validatedParams.uuid,
    user,
    c.req.header(),
  );
  return response.ok(c, result);
});

practiceApp.openapi(routes.listMembersRoute, async () => {
  throw new Error('This should never be called');
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
  const validatedParams = c.get('validatedParams');
  const validatedBody = c.get('validatedBody');

  const result = await membersService.updatePracticeMemberRole(
    validatedParams.uuid,
    validatedBody.member_id,
    validatedBody.role,
    user,
    c.req.header(),
  );
  return response.ok(c, result);
});

practiceApp.openapi(routes.updateMemberRoleRoute, async () => {
  throw new Error('This should never be called');
});

/**
 * DELETE /api/practice/:uuid/members/:userId
 * Remove a member from an organization
 */
const userIdParamSchema = practiceValidations.practiceIdParamSchema.extend({
  userId: z.string().uuid(), // Both user ID and organization ID are UUIDs
});

practiceApp.delete('/:uuid/members/:userId', validateParams(userIdParamSchema, 'Invalid Parameters'), async (c) => {
  const user = c.get('user')!;
  const validatedParams = c.get('validatedParams');

  await membersService.removePracticeMember(
    validatedParams.uuid,
    validatedParams.userId,
    user,
    c.req.header(),
  );
  return response.noContent(c);
});

practiceApp.openapi(routes.removeMemberRoute, async () => {
  throw new Error('This should never be called');
});

/**
 * GET /api/practice/invitations
 * List all pending invitations for the current user
 */
practiceApp.get('/invitations', async (c) => {
  const user = c.get('user')!;

  const invitations = await invitationsService.listPracticeInvitations(
    user,
    c.req.header(),
  );
  return response.ok(c, { invitations });
});

practiceApp.openapi(routes.listInvitationsRoute, async () => {
  throw new Error('This should never be called');
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
  const validatedParams = c.get('validatedParams');
  const validatedBody = c.get('validatedBody');

  const result = await invitationsService.createPracticeInvitation(
    validatedParams.uuid,
    validatedBody.email,
    validatedBody.role,
    user,
    c.req.header(),
  );
  return response.created(c, result);
});

practiceApp.openapi(routes.createInvitationRoute, async () => {
  throw new Error('This should never be called');
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
  const validatedParams = c.get('validatedParams');

  const result = await invitationsService.acceptPracticeInvitation(
    validatedParams.invitationId,
    user,
    c.req.header(),
  );
  return response.ok(c, result);
});

practiceApp.openapi(routes.acceptInvitationRoute, async () => {
  throw new Error('This should never be called');
});

export default practiceApp;
