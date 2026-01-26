import { getLogger } from '@logtape/logtape';
import type { MemberRole } from '@/modules/practice/types/members.types';
import { createBetterAuthInstance, type BetterAuthInstance } from '@/shared/auth/better-auth';
import betterAuthUtils from '@/shared/auth/utils/betterAuthUtils';
import { db } from '@/shared/database';
import { PracticeMemberRoleChanged, PracticeMemberRemoved } from '@/shared/events/definitions';
import type { User } from '@/shared/types/BetterAuth';
import type { Result } from '@/shared/types/result';
import { ok, internalError } from '@/shared/utils/result';

const logger = getLogger(['practice', 'members-service']);

// Lazy initialization - only create when needed (after env vars are loaded)
const getBetterAuth = (): BetterAuthInstance => createBetterAuthInstance(db);
const { getBetterAuthErrorMessage } = betterAuthUtils;

const listPracticeMembers = async (
  organizationId: string,
  user: User,
  requestHeaders: Record<string, string>,
): Promise<Result<unknown>> => {
  try {
    const betterAuth = getBetterAuth();
    const result = await betterAuth.api.listMembers({
      query: {
        organizationId,
        limit: 100,
        offset: 0,
      },
      headers: requestHeaders,
    });
    return ok(result);
  } catch (error) {
    logger.error('Failed to list members for organization {organizationId}: {error}', { organizationId, error });
    return internalError(getBetterAuthErrorMessage(error, 'Failed to list members'));
  }
};

const updatePracticeMemberRole = async (
  organizationId: string,
  memberId: string,
  newRole: MemberRole,
  user: User,
  requestHeaders: Record<string, string>,
): Promise<Result<{ success: boolean }>> => {
  try {
    const betterAuth = getBetterAuth();
    await betterAuth.api.updateMemberRole({
      body: {
        organizationId,
        memberId,
        role: newRole,
      },
      headers: requestHeaders,
    });

    void PracticeMemberRoleChanged.dispatch({
      member_id: memberId,
      new_role: newRole,
    }, {
      actorId: user.id,
      organizationId,
    });

    return ok({ success: true });
  } catch (error) {
    logger.error('Failed to update member role in {organizationId}: {error}', { organizationId, error });
    return internalError(getBetterAuthErrorMessage(error, 'Failed to update member role'));
  }
};

const removePracticeMember = async (
  organizationId: string,
  userId: string,
  user: User,
  requestHeaders: Record<string, string>,
): Promise<Result<{ success: boolean }>> => {
  try {
    const betterAuth = getBetterAuth();
    await betterAuth.api.removeMember({
      body: {
        organizationId,
        memberIdOrEmail: userId,
      },
      headers: requestHeaders,
    });

    void PracticeMemberRemoved.dispatch({
      removed_user_id: userId,
    }, {
      actorId: user.id,
      organizationId,
    });

    return ok({ success: true });
  } catch (error) {
    logger.error('Failed to remove member from {organizationId}: {error}', { organizationId, error });
    return internalError(getBetterAuthErrorMessage(error, 'Failed to remove member'));
  }
};

/**
 * Members Service Object
 */
export const membersService = {
  listPracticeMembers,
  updatePracticeMemberRole,
  removePracticeMember,
};

export default membersService;
