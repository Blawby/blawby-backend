import { ForbiddenError } from '@casl/ability';
import { getLogger } from '@logtape/logtape';
import { HTTPException } from 'hono/http-exception';
import {
  practiceMemberProfilesRepository,
  type UpsertMemberProfileData,
} from '@/modules/practice/database/queries/practice-member-profiles.repository';
import type { SelectPracticeMemberProfile } from '@/modules/practice/database/schema/practice-member-profiles.schema';
import type {
  MemberProfileResponse,
  UpdateMemberProfileInput,
} from '@/modules/practice/validations/member-profiles.validation';
import { toSubject } from '@/shared/auth/subject-helpers';
import { membersRepository } from '@/shared/repositories/members.repository';
import type { ServiceContext } from '@/shared/types/service-context';

const logger = getLogger(['practice', 'member-profile-service']);

/** Resolve the membership row for a user in the context's organization. */
const resolveMemberId = async (userId: string, ctx: ServiceContext): Promise<string> => {
  const member = await membersRepository.findByOrgAndUser({ organizationId: ctx.organizationId, userId });
  if (!member) {
    throw new HTTPException(404, { message: 'Member not found' });
  }
  return member.id;
};

/** Keep only the fields the caller actually provided so a partial PUT never clobbers absent fields. */
const buildUpsertPayload = (data: UpdateMemberProfileInput): UpsertMemberProfileData => {
  const payload: UpsertMemberProfileData = {};
  if (data.practice_areas !== undefined) payload.practice_areas = data.practice_areas;
  if (data.service_counties !== undefined) payload.service_counties = data.service_counties;
  if (data.max_capacity !== undefined) payload.max_capacity = data.max_capacity;
  if (data.accepting_clients !== undefined) payload.accepting_clients = data.accepting_clients;
  return payload;
};

const serialize = (
  profile: SelectPracticeMemberProfile,
  userId: string,
  currentMatters: number
): MemberProfileResponse => ({
  id: profile.id,
  member_id: profile.member_id,
  user_id: userId,
  practice_areas: profile.practice_areas,
  service_counties: profile.service_counties,
  max_capacity: profile.max_capacity,
  accepting_clients: profile.accepting_clients,
  current_matters: currentMatters,
  created_at: profile.created_at.toISOString(),
  updated_at: profile.updated_at.toISOString(),
});

const getProfile = async (params: { userId: string }, ctx: ServiceContext): Promise<MemberProfileResponse> => {
  ForbiddenError.from(ctx.ability).throwUnlessCan('read', 'MemberProfile');

  const { userId } = params;

  try {
    const memberId = await resolveMemberId(userId, ctx);

    const profile = await practiceMemberProfilesRepository.findByMemberId(memberId);
    if (!profile) {
      throw new HTTPException(404, { message: 'Member profile not found' });
    }

    const currentMatters = await practiceMemberProfilesRepository.countActiveMatters(ctx.organizationId, userId);
    return serialize(profile, userId, currentMatters);
  } catch (error) {
    if (error instanceof HTTPException) {
      throw error;
    }
    logger.error('Failed to get member profile: {error}', { error, organizationId: ctx.organizationId });
    throw new HTTPException(500, { message: 'Failed to get member profile' });
  }
};

const upsertProfile = async (
  params: { userId: string; data: UpdateMemberProfileInput },
  ctx: ServiceContext
): Promise<MemberProfileResponse> => {
  ForbiddenError.from(ctx.ability).throwUnlessCan('update', toSubject('MemberProfile', { user_id: params.userId }));

  const { userId, data } = params;

  try {
    const memberId = await resolveMemberId(userId, ctx);

    const profile = await practiceMemberProfilesRepository.upsert(memberId, buildUpsertPayload(data));
    const currentMatters = await practiceMemberProfilesRepository.countActiveMatters(ctx.organizationId, userId);
    return serialize(profile, userId, currentMatters);
  } catch (error) {
    if (error instanceof HTTPException) {
      throw error;
    }
    logger.error('Failed to upsert member profile: {error}', { error, organizationId: ctx.organizationId });
    throw new HTTPException(500, { message: 'Failed to save member profile' });
  }
};

export const memberProfilesService = {
  getProfile,
  upsertProfile,
};
