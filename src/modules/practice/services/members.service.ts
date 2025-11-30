import type { MemberRole, MemberListItem } from '@/modules/practice/types/members.types';
import { isValidMemberRole } from '@/modules/practice/types/members.types';
import { createBetterAuthInstance } from '@/shared/auth/better-auth';
import { db } from '@/shared/database';
import { EventType } from '@/shared/events/enums/event-types';
import { publishSimpleEvent } from '@/shared/events/event-publisher';
import type { User } from '@/shared/types/BetterAuth';

const betterAuth = createBetterAuthInstance(db);

/**
 * List all members of an organization
 */
export const listPracticeMembers = async function listPracticeMembers(
  organizationId: string,
  user: User,
  requestHeaders: Record<string, string>,
): Promise<MemberListItem[]> {
  // Use Better Auth API to list members
  const members = await betterAuth.api.listMembers({
    query: {
      organizationId,
      limit: 100,
      offset: 0,
    },
    headers: requestHeaders,
  });

  if (!members || !Array.isArray(members)) {
    return [];
  }

  // Transform Better Auth member format to our expected format (snake_case for API response)
  return members.map((member) => {
    const role = isValidMemberRole(member.role) ? member.role : 'member';
    return {
      user_id: member.userId || member.memberId || '',
      email: member.user?.email || '',
      name: member.user?.name || null,
      role,
      joined_at: member.createdAt ? new Date(member.createdAt).getTime() : Date.now(),
    };
  });
};

/**
 * Update a member's role
 */
export const updatePracticeMemberRole = async function updatePracticeMemberRole(
  organizationId: string,
  userId: string,
  newRole: MemberRole,
  user: User,
  requestHeaders: Record<string, string>,
): Promise<{ success: boolean }> {
  // Use Better Auth API to update member role
  await betterAuth.api.updateMemberRole({
    body: {
      organizationId,
      memberId: userId,
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
      target_user_id: userId,
      new_role: newRole,
    },
  );

  return { success: true };
};

/**
 * Remove a member from an organization
 */
export const removePracticeMember = async function removePracticeMember(
  organizationId: string,
  userId: string,
  user: User,
  requestHeaders: Record<string, string>,
): Promise<{ success: boolean }> {
  // Use Better Auth API to remove member
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
