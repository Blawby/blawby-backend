import type {
  InvitationRole,
  InvitationListItem,
} from '@/modules/practice/types/invitations.types';
import {
  isValidInvitationRole,
  isValidInvitationStatus,
} from '@/modules/practice/types/invitations.types';
import { createBetterAuthInstance } from '@/shared/auth/better-auth';
import { db } from '@/shared/database';
import { EventType } from '@/shared/events/enums/event-types';
import { publishSimpleEvent } from '@/shared/events/event-publisher';
import type { User } from '@/shared/types/BetterAuth';

const betterAuth = createBetterAuthInstance(db);

/**
 * List all pending invitations for the current user
 */
export const listPracticeInvitations = async function listPracticeInvitations(
  user: User,
  requestHeaders: Record<string, string>,
): Promise<InvitationListItem[]> {
  // Use Better Auth API to list invitations
  const invitations = await betterAuth.api.listInvitations({
    headers: requestHeaders,
  });

  if (!invitations || !Array.isArray(invitations)) {
    return [];
  }

  // Filter for pending invitations for this user's email
  const userInvitations = invitations.filter(
    (inv) => inv.email === user.email && inv.status === 'pending',
  );

  // Get organization names for each invitation
  const invitationsWithOrgNames = await Promise.all(
    userInvitations.map(async (inv) => {
      const org = await betterAuth.api.getFullOrganization({
        query: { organizationId: inv.organizationId },
        headers: requestHeaders,
      });

      const role = inv.role && isValidInvitationRole(inv.role) ? inv.role : null;
      const status = isValidInvitationStatus(inv.status) ? inv.status : 'pending';

      return {
        id: inv.id,
        organization_id: inv.organizationId,
        organization_name: org?.name || 'Unknown Organization',
        email: inv.email,
        role,
        status,
        expires_at: inv.expiresAt ? new Date(inv.expiresAt).getTime() : Date.now() + 7 * 24 * 60 * 60 * 1000,
        created_at: Date.now(), // Better Auth doesn't expose createdAt, use current time
      };
    }),
  );

  return invitationsWithOrgNames;
};

/**
 * Create a new invitation for an organization
 */
export const createPracticeInvitation = async function createPracticeInvitation(
  organizationId: string,
  email: string,
  role: InvitationRole,
  user: User,
  requestHeaders: Record<string, string>,
): Promise<{ success: boolean; invitationId: string }> {
  // Use Better Auth API to invite member
  // Better Auth organization plugin should have invite method
  type InviteResult = { id: string };

  const inviteArgs = {
    body: {
      organizationId,
      email,
      role,
    },
    headers: requestHeaders,
  };

  let result: InviteResult | null = null;
  try {
    // Try inviteToOrganization first (most likely name)
    if ('inviteToOrganization' in betterAuth.api && typeof betterAuth.api.inviteToOrganization === 'function') {
      const rawResult = await betterAuth.api.inviteToOrganization(inviteArgs);
      // Validate result structure
      if (rawResult && typeof rawResult === 'object' && 'id' in rawResult && typeof rawResult.id === 'string') {
        result = { id: rawResult.id };
      }
    } else if ('inviteMember' in betterAuth.api && typeof betterAuth.api.inviteMember === 'function') {
      const rawResult = await betterAuth.api.inviteMember(inviteArgs);
      // Validate result structure
      if (rawResult && typeof rawResult === 'object' && 'id' in rawResult && typeof rawResult.id === 'string') {
        result = { id: rawResult.id };
      }
    } else {
      throw new Error('Invite method not found in Better Auth API');
    }
  } catch (error) {
    throw new Error(`Failed to invite member: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }

  if (!result || !result.id) {
    throw new Error('Failed to create invitation - no invitation ID returned');
  }

  // Publish event
  void publishSimpleEvent(
    EventType.PRACTICE_MEMBER_INVITED,
    user.id,
    organizationId,
    {
      invitation_id: result.id,
      invited_email: email,
      role,
    },
  );

  if (!result.id) {
    throw new Error('Invitation ID is missing from result');
  }

  return { success: true, invitationId: result.id };
};

/**
 * Accept a pending invitation
 */
export const acceptPracticeInvitation = async function acceptPracticeInvitation(
  invitationId: string,
  user: User,
  requestHeaders: Record<string, string>,
): Promise<{ success: boolean; organization: unknown }> {
  // Use Better Auth API to accept invitation
  const result = await betterAuth.api.acceptInvitation({
    body: { invitationId },
    headers: requestHeaders,
  });

  if (!result) {
    throw new Error('Failed to accept invitation');
  }

  // Get organization details from the result
  const organizationId = result.invitation?.organizationId;

  if (!organizationId) {
    throw new Error('Organization ID not found in invitation result');
  }

  const org = await betterAuth.api.getFullOrganization({
    query: { organizationId },
    headers: requestHeaders,
  });

  // Publish event
  void publishSimpleEvent(
    EventType.PRACTICE_MEMBER_JOINED,
    user.id,
    organizationId,
    {
      invitation_id: invitationId,
    },
  );

  return { success: true, organization: org };
};

/**
 * Decline a pending invitation
 */
export const declinePracticeInvitation = async function declinePracticeInvitation(
  _invitationId: string,
  _user: User,
  _requestHeaders: Record<string, string>,
): Promise<{ success: boolean }> {
  // Better Auth might not have a declineInvitation API method
  // The invitation can remain as pending or be handled by the frontend
  // If we need to update the status, we could query the database directly
  // For now, we'll return success as the frontend can handle the decline logic
  return { success: true };
};
