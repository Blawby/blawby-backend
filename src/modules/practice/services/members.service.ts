import { getLogger } from '@logtape/logtape';
import type { MemberRole } from '@/modules/practice/types/members.types';
import { createBetterAuthInstance } from '@/shared/auth/better-auth';
import { db } from '@/shared/database';
import { EventType } from '@/shared/events/enums/event-types';
import { publishSimpleEvent } from '@/shared/events/event-publisher';
import type { User } from '@/shared/types/BetterAuth';
import { Result, ok, internalError, forbidden } from '@/shared/types/result';
import betterAuthUtils from '@/shared/auth/utils/betterAuthUtils';

const logger = getLogger(['practice', 'members-service']);

// Lazy initialization - only create when needed (after env vars are loaded)
const getBetterAuth = () => createBetterAuthInstance(db);
const { getBetterAuthErrorMessage } = betterAuthUtils;

/**
 * List all members of an organization
 * Returns Better Auth's response format as-is
 */
export const listPracticeMembers = async (
  organizationId: string,
  user: User,
  requestHeaders: Record<string, string>,
): Promise<Result<any>> => {
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

/**
 * Update a member's role
 */
export const updatePracticeMemberRole = async (
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

    void publishSimpleEvent(
      EventType.PRACTICE_MEMBER_ROLE_CHANGED,
      user.id,
      organizationId,
      {
        member_id: memberId,
        new_role: newRole,
      },
    );

    return ok({ success: true });
  } catch (error) {
    logger.error('Failed to update member role in {organizationId}: {error}', { organizationId, error });
    return internalError(getBetterAuthErrorMessage(error, 'Failed to update member role'));
  }
};

/**
 * Remove a member from an organization
 */
export const removePracticeMember = async (
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

    void publishSimpleEvent(
      EventType.PRACTICE_MEMBER_REMOVED,
      user.id,
      organizationId,
      {
        removed_user_id: userId,
      },
    );

    return ok({ success: true });
  } catch (error) {
    logger.error('Failed to remove member from {organizationId}: {error}', { organizationId, error });
    return internalError(getBetterAuthErrorMessage(error, 'Failed to remove member'));
  }
};
