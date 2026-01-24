import { AppRouteHandler } from '@/shared/types/hono';
import { response } from '@/shared/utils/responseUtils';
import { practiceService } from '@/modules/practice/services/practice.service';
import { membersService } from '@/modules/practice/services/members.service';
import { invitationsService } from '@/modules/practice/services/invitations.service';
import { practiceDetailsService } from '@/modules/practice/services/practice-details.service';
import {
  listPracticesRoute,
  createPracticeRoute,
  getPracticeByIdRoute,
  updatePracticeRoute,
  deletePracticeRoute,
  setActivePracticeRoute,
  listMembersRoute,
  updateMemberRoleRoute,
  removeMemberRoute,
  listInvitationsRoute,
  createInvitationRoute,
  acceptInvitationRoute,
  declineInvitationRoute,
  getPracticeDetailsRoute,
  createPracticeDetailsRoute,
  updatePracticeDetailsRoute,
  deletePracticeDetailsRoute,
  getPracticeDetailsBySlugRoute,
} from '@/modules/practice/routes';

export const listPracticesHandler: AppRouteHandler<typeof listPracticesRoute> = async (c) => {
  const user = c.get('user')!;
  const result = await practiceService.listPractices(user, c.req.header());
  return response.fromResult(c, result);
};

export const createPracticeHandler: AppRouteHandler<typeof createPracticeRoute> = async (c) => {
  const user = c.get('user')!;
  const validatedBody = c.req.valid('json');
  const result = await practiceService.createPractice({
    data: validatedBody,
    user,
    requestHeaders: c.req.header(),
  });
  return response.fromResult(c, result, 201);
};

export const getPracticeHandler: AppRouteHandler<typeof getPracticeByIdRoute> = async (c) => {
  const user = c.get('user')!;
  const { uuid } = c.req.valid('param');
  const result = await practiceService.getPracticeById(uuid, user, c.req.header());
  return response.fromResult(c, result);
};

export const updatePracticeHandler: AppRouteHandler<typeof updatePracticeRoute> = async (c) => {
  const user = c.get('user')!;
  const { uuid } = c.req.valid('param');
  const validatedBody = c.req.valid('json');
  const result = await practiceService.updatePractice(uuid, validatedBody, user, c.req.header());
  return response.fromResult(c, result);
};

export const deletePracticeHandler: AppRouteHandler<typeof deletePracticeRoute> = async (c) => {
  const user = c.get('user')!;
  const { uuid } = c.req.valid('param');
  const result = await practiceService.deletePractice(uuid, user, c.req.header());
  return response.fromResult(c, result, 204);
};

export const setActivePracticeHandler: AppRouteHandler<typeof setActivePracticeRoute> = async (c) => {
  const user = c.get('user')!;
  const { uuid } = c.req.valid('param');
  const result = await practiceService.setActivePractice(uuid, user, c.req.header());
  return response.fromResult(c, result);
};

export const listMembersHandler: AppRouteHandler<typeof listMembersRoute> = async (c) => {
  const user = c.get('user')!;
  const { uuid } = c.req.valid('param');
  const result = await membersService.listPracticeMembers(uuid, user, c.req.header());
  return response.fromResult(c, result);
};

export const updateMemberRoleHandler: AppRouteHandler<typeof updateMemberRoleRoute> = async (c) => {
  const user = c.get('user')!;
  const { uuid } = c.req.valid('param');
  const validatedBody = c.req.valid('json');
  const result = await membersService.updatePracticeMemberRole(uuid, validatedBody.member_id, validatedBody.role, user, c.req.header());
  return response.fromResult(c, result);
};

export const removeMemberHandler: AppRouteHandler<typeof removeMemberRoute> = async (c) => {
  const user = c.get('user')!;
  const { uuid, userId } = c.req.valid('param');
  const result = await membersService.removePracticeMember(uuid, userId, user, c.req.header());
  return response.fromResult(c, result, 204);
};

export const listInvitationsHandler: AppRouteHandler<typeof listInvitationsRoute> = async (c) => {
  const user = c.get('user')!;
  const result = await invitationsService.listPracticeInvitations(user, c.req.header());
  return response.fromResult(c, result);
};

export const createInvitationHandler: AppRouteHandler<typeof createInvitationRoute> = async (c) => {
  const user = c.get('user')!;
  const { uuid } = c.req.valid('param');
  const validatedBody = c.req.valid('json');
  const result = await invitationsService.createPracticeInvitation(uuid, validatedBody.email, validatedBody.role, user, c.req.header());
  return response.fromResult(c, result, 201);
};

export const acceptInvitationHandler: AppRouteHandler<typeof acceptInvitationRoute> = async (c) => {
  const user = c.get('user')!;
  const { invitationId } = c.req.valid('param');
  const result = await invitationsService.acceptPracticeInvitation(invitationId, user, c.req.header());
  return response.fromResult(c, result);
};

export const declineInvitationHandler: AppRouteHandler<typeof declineInvitationRoute> = async (c) => {
  const user = c.get('user')!;
  const { invitationId } = c.req.valid('param');
  const result = await invitationsService.declinePracticeInvitation(invitationId, user, c.req.header());
  return response.fromResult(c, result);
};

export const getPracticeDetailsHandler: AppRouteHandler<typeof getPracticeDetailsRoute> = async (c) => {
  const user = c.get('user')!;
  const { uuid } = c.req.valid('param');
  const result = await practiceDetailsService.getPracticeDetails(uuid, user, c.req.header());
  return response.fromResult(c, result);
};

export const createPracticeDetailsHandler: AppRouteHandler<typeof createPracticeDetailsRoute> = async (c) => {
  const user = c.get('user')!;
  const { uuid } = c.req.valid('param');
  const validatedBody = c.req.valid('json');
  const result = await practiceDetailsService.upsertPracticeDetails(uuid, validatedBody, user, c.req.header());
  return response.fromResult(c, result, 201);
};

export const updatePracticeDetailsHandler: AppRouteHandler<typeof updatePracticeDetailsRoute> = async (c) => {
  const user = c.get('user')!;
  const { uuid } = c.req.valid('param');
  const validatedBody = c.req.valid('json');
  const result = await practiceDetailsService.upsertPracticeDetails(uuid, validatedBody, user, c.req.header());
  return response.fromResult(c, result);
};

export const deletePracticeDetailsHandler: AppRouteHandler<typeof deletePracticeDetailsRoute> = async (c) => {
  const user = c.get('user')!;
  const { uuid } = c.req.valid('param');
  const result = await practiceDetailsService.deletePracticeDetails(uuid, user, c.req.header());
  return response.fromResult(c, result, 204);
};

export const getPracticeDetailsBySlugHandler: AppRouteHandler<typeof getPracticeDetailsBySlugRoute> = async (c) => {
  const { slug } = c.req.valid('param');
  const result = await practiceDetailsService.getPracticeDetailsBySlug(slug);
  return response.fromResult(c, result);
};
