import type { InvitationListItem, InvitationRole } from '@/modules/practice/types/invitations.types';
import { createBetterAuthInstance } from '@/shared/auth/better-auth';
import { db } from '@/shared/database';
import { EventType } from '@/shared/events/enums/event-types';
import { publishSimpleEvent } from '@/shared/events/event-publisher';
import type { Invitation, User } from '@/shared/types/BetterAuth';
import { reportMeteredUsage } from '@/modules/subscriptions/services/meteredProducts.service';
import { METERED_TYPES } from '@/modules/subscriptions/constants/meteredProducts';

// Lazy initialization - only create when needed (after env vars are loaded)
const getBetterAuth = () => createBetterAuthInstance(db);

/**
 * List all pending invitations for the current user
 */
export const listPracticeInvitations = async (
  user: User,
  requestHeaders: Record<string, string>,
): Promise<InvitationListItem[]> => {
  // Use Better Auth API to list invitations
  const betterAuth = getBetterAuth();
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
  // Better Auth validates roles, so we can trust the response types
  const invitationsWithOrgNames = await Promise.all(
    userInvitations.map(async (inv: Invitation) => {
      const org = await betterAuth.api.getFullOrganization({
        query: { organizationId: inv.organizationId },
        headers: requestHeaders,
      });

      return {
        id: inv.id,
        organization_id: inv.organizationId,
        organization_name: org?.name || 'Unknown Organization',
        email: inv.email,
        role: inv.role || null, // Better Auth validates roles, so this is safe
        status: inv.status || 'pending', // Better Auth validates status
        expires_at: inv.expiresAt ? new Date(inv.expiresAt).getTime() : Date.now() + 7 * 24 * 60 * 60 * 1000,
        created_at: Date.now(), // Better Auth doesn't expose createdAt in Invitation type
      };
    }),
  );

  return invitationsWithOrgNames;
};

/**
 * Create a new invitation for an organization
 */
export const createPracticeInvitation = async (
  organizationId: string,
  email: string,
  role: InvitationRole,
  user: User,
  requestHeaders: Record<string, string>,
): Promise<{ success: boolean; invitationId: string }> => {
  // Use Better Auth API to create invitation
  // Better Auth validates the role and returns the invitation ID
  const betterAuth = getBetterAuth();
  const result = await betterAuth.api.createInvitation({
    body: {
      organizationId,
      email,
      role,
    },
    headers: requestHeaders,
  });

  // Better Auth returns the invitation with an id field
  const invitationId = result?.id;

  if (!invitationId) {
    throw new Error('Failed to create invitation - no invitation ID returned');
  }

  // Publish event
  void publishSimpleEvent(
    EventType.PRACTICE_MEMBER_INVITED,
    user.id,
    organizationId,
    {
      invitation_id: invitationId,
      invited_email: email,
      role,
    },
  );

  return { success: true, invitationId };
};

/**
 * Accept a pending invitation
 */
export const acceptPracticeInvitation = async (
  invitationId: string,
  user: User,
  requestHeaders: Record<string, string>,
): Promise<{ success: boolean; organization: unknown }> => {
  // Use Better Auth API to accept invitation
  const betterAuth = getBetterAuth();
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

  // Report metered usage for new user seat (fire-and-forget)
  // This will auto-attach the metered product if configured in the plan
  void reportMeteredUsage(db, organizationId, METERED_TYPES.USER_SEAT, 1);

  return { success: true, organization: org };
};
