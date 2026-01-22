import { AppRouteHandler } from '@/shared/types/hono';
import { response } from '@/shared/utils/responseUtils';
import * as practiceService from '@/modules/practice/services/practice.service';
import * as membersService from '@/modules/practice/services/members.service';
import * as invitationsService from '@/modules/practice/services/invitations.service';
import * as practiceDetailsService from '@/modules/practice/services/practice-details.service';
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
  const practices = await practiceService.listPractices(user, c.req.header());
  return response.ok(c, { practices });
};

export const createPracticeHandler: AppRouteHandler<typeof createPracticeRoute> = async (c) => {
  const user = c.get('user')!;
  const validatedBody = c.req.valid('json');
  const practice = await practiceService.createPracticeService({
    data: validatedBody,
    user,
    requestHeaders: c.req.header(),
  });
  return response.created(c, { practice });
};

export const getPracticeHandler: AppRouteHandler<typeof getPracticeByIdRoute> = async (c) => {
  const user = c.get('user')!;
  const { uuid } = c.req.valid('param');
  const practice = await practiceService.getPracticeById(uuid, user, c.req.header());
  return response.ok(c, { practice });
};

export const updatePracticeHandler: AppRouteHandler<typeof updatePracticeRoute> = async (c) => {
  const user = c.get('user')!;
  const { uuid } = c.req.valid('param');
  const validatedBody = c.req.valid('json');
  const practice = await practiceService.updatePracticeService(uuid, validatedBody, user, c.req.header());
  return response.ok(c, { practice });
};

export const deletePracticeHandler: AppRouteHandler<typeof deletePracticeRoute> = async (c) => {
  const user = c.get('user')!;
  const { uuid } = c.req.valid('param');
  await practiceService.deletePracticeService(uuid, user, c.req.header());
  return response.noContent(c);
};

export const setActivePracticeHandler: AppRouteHandler<typeof setActivePracticeRoute> = async (c) => {
  const user = c.get('user')!;
  const { uuid } = c.req.valid('param');
  const result = await practiceService.setActivePractice(uuid, user, c.req.header());
  return response.ok(c, { result });
};

export const listMembersHandler: AppRouteHandler<typeof listMembersRoute> = async (c) => {
  const user = c.get('user')!;
  const { uuid } = c.req.valid('param');
  const result = await membersService.listPracticeMembers(uuid, user, c.req.header());
  return response.ok(c, result);
};

export const updateMemberRoleHandler: AppRouteHandler<typeof updateMemberRoleRoute> = async (c) => {
  const user = c.get('user')!;
  const { uuid } = c.req.valid('param');
  const validatedBody = c.req.valid('json');
  const result = await membersService.updatePracticeMemberRole(uuid, validatedBody.member_id, validatedBody.role, user, c.req.header());
  return response.ok(c, result);
};

export const removeMemberHandler: AppRouteHandler<typeof removeMemberRoute> = async (c) => {
  const user = c.get('user')!;
  const { uuid, userId } = c.req.valid('param');
  await membersService.removePracticeMember(uuid, userId, user, c.req.header());
  return response.noContent(c);
};

export const listInvitationsHandler: AppRouteHandler<typeof listInvitationsRoute> = async (c) => {
  const user = c.get('user')!;
  const invitations = await invitationsService.listPracticeInvitations(user, c.req.header());
  return response.ok(c, { invitations });
};

export const createInvitationHandler: AppRouteHandler<typeof createInvitationRoute> = async (c) => {
  const user = c.get('user')!;
  const { uuid } = c.req.valid('param');
  const validatedBody = c.req.valid('json');
  const result = await invitationsService.createPracticeInvitation(uuid, validatedBody.email, validatedBody.role, user, c.req.header());
  return response.created(c, result);
};

export const acceptInvitationHandler: AppRouteHandler<typeof acceptInvitationRoute> = async (c) => {
  const user = c.get('user')!;
  const { invitationId } = c.req.valid('param');
  const result = await invitationsService.acceptPracticeInvitation(invitationId, user, c.req.header());
  return response.ok(c, result);
};

export const declineInvitationHandler: AppRouteHandler<typeof declineInvitationRoute> = async (c) => {
  const user = c.get('user')!;
  const { invitationId } = c.req.valid('param');
  const result = await invitationsService.declinePracticeInvitation(invitationId, user, c.req.header());
  return response.ok(c, result);
};

export const getPracticeDetailsHandler: AppRouteHandler<typeof getPracticeDetailsRoute> = async (c) => {
  const user = c.get('user')!;
  const { uuid } = c.req.valid('param');
  const details = await practiceDetailsService.getPracticeDetails(uuid, user, c.req.header());
  return response.ok(c, { details });
};

export const createPracticeDetailsHandler: AppRouteHandler<typeof createPracticeDetailsRoute> = async (c) => {
  const user = c.get('user')!;
  const { uuid } = c.req.valid('param');
  const validatedBody = c.req.valid('json');
  const details = await practiceDetailsService.upsertPracticeDetailsService(uuid, validatedBody, user, c.req.header());
  return response.created(c, { details });
};

export const updatePracticeDetailsHandler: AppRouteHandler<typeof updatePracticeDetailsRoute> = async (c) => {
  const user = c.get('user')!;
  const { uuid } = c.req.valid('param');
  const validatedBody = c.req.valid('json');
  const details = await practiceDetailsService.upsertPracticeDetailsService(uuid, validatedBody, user, c.req.header());
  return response.ok(c, { details });
};

export const deletePracticeDetailsHandler: AppRouteHandler<typeof deletePracticeDetailsRoute> = async (c) => {
  const user = c.get('user')!;
  const { uuid } = c.req.valid('param');
  await practiceDetailsService.deletePracticeDetailsService(uuid, user, c.req.header());
  return response.noContent(c);
};

export const getPracticeDetailsBySlugHandler: AppRouteHandler<typeof getPracticeDetailsBySlugRoute> = async (c) => {
  const { slug } = c.req.valid('param');
  const details = await practiceDetailsService.getPracticeDetailsBySlug(slug);
  if (!details) return response.notFound(c, 'Practice not found');
  return response.ok(c, { details });
};
