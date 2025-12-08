import type { MemberRole } from '@/modules/practice/types/members.types';
import { createBetterAuthInstance } from '@/shared/auth/better-auth';
import { db } from '@/shared/database';
import { EventType } from '@/shared/events/enums/event-types';
import { publishSimpleEvent } from '@/shared/events/event-publisher';
import type { User } from '@/shared/types/BetterAuth';

// Lazy initialization - only create when needed (after env vars are loaded)
const getBetterAuth = () => createBetterAuthInstance(db);

/**
 * List all members of an organization
 * Returns Better Auth's response format as-is
 */
export const listPracticeMembers = async (
  organizationId: string,
  user: User,
  requestHeaders: Record<string, string>,
): Promise<Awaited<ReturnType<ReturnType<typeof getBetterAuth>['api']['listMembers']>>> => {
  // Use Better Auth API to list members
  const betterAuth = getBetterAuth();
  return await betterAuth.api.listMembers({
    query: {
      organizationId,
      limit: 100,
      offset: 0,
    },
    headers: requestHeaders,
  });
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
): Promise<{ success: boolean }> => {
  // Use Better Auth API to update member role directly
  const betterAuth = getBetterAuth();
  await betterAuth.api.updateMemberRole({
    body: {
      organizationId,
      memberId,
      role: newRole,
    },
    headers: requestHeaders,
  });

  // Publish event
  void publishSimpleEvent(
    EventType.PRACTICE_MEMBER_ROLE_CHANGED,
    user.id,
    organizationId,
    {
      member_id: memberId,
      new_role: newRole,
    },
  );

  return { success: true };
};

/**
 * Remove a member from an organization
 */
export const removePracticeMember = async (
  organizationId: string,
  userId: string,
  user: User,
  requestHeaders: Record<string, string>,
): Promise<{ success: boolean }> => {
  // Use Better Auth API to remove member
  const betterAuth = getBetterAuth();
  await betterAuth.api.removeMember({
    body: {
      organizationId,
      memberIdOrEmail: userId,
    },
    headers: requestHeaders,
  });

  // Publish event
  void publishSimpleEvent(
    EventType.PRACTICE_MEMBER_REMOVED,
    user.id,
    organizationId,
    {
      removed_user_id: userId,
    },
  );

  return { success: true };
};
