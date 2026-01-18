import { getLogger } from '@logtape/logtape';
import type { InvitationListItem, InvitationRole } from '@/modules/practice/types/invitations.types';
import { createBetterAuthInstance } from '@/shared/auth/better-auth';
import { db } from '@/shared/database';
import { EventType } from '@/shared/events/enums/event-types';
import { publishSimpleEvent } from '@/shared/events/event-publisher';
import type { Invitation, User } from '@/shared/types/BetterAuth';
import { reportMeteredUsage } from '@/modules/subscriptions/services/meteredProducts.service';
import { METERED_TYPES } from '@/modules/subscriptions/constants/meteredProducts';
import { getFullOrganization } from '@/modules/practice/services/organization.service';
import betterAuthUtils from '@/shared/auth/utils/betterAuthUtils';
import { Result, ok, internalError } from '@/shared/types/result';

const logger = getLogger(['practice', 'invitations-service']);

// Lazy initialization - only create when needed (after env vars are loaded)
const getBetterAuth = () => createBetterAuthInstance(db);
const { getBetterAuthErrorMessage } = betterAuthUtils;

export const listPracticeInvitations = async (
  user: User,
  requestHeaders: Record<string, string>,
): Promise<Result<InvitationListItem[]>> => {
  try {
    const betterAuth = getBetterAuth();
    const invitations = await betterAuth.api.listInvitations({
      headers: requestHeaders,
    });

    if (!invitations || !Array.isArray(invitations)) {
      return ok([]);
    }

    const userInvitations = invitations.filter(
      (inv) => inv.email === user.email && inv.status === 'pending',
    );

    const invitationsWithOrgNames = await Promise.all(
      userInvitations.map(async (inv: Invitation) => {
        const orgResult = await getFullOrganization(inv.organizationId, user, requestHeaders);
        const orgName = orgResult.success ? orgResult.data.name : 'Unknown Organization';

        return {
          id: inv.id,
          organization_id: inv.organizationId,
          organization_name: orgName,
          email: inv.email,
          role: inv.role || null,
          status: inv.status || 'pending',
          expires_at: inv.expiresAt ? new Date(inv.expiresAt).getTime() : Date.now() + 7 * 24 * 60 * 60 * 1000,
          created_at: Date.now(),
        };
      }),
    );

    return ok(invitationsWithOrgNames);
  } catch (error) {
    logger.error('Failed to list invitations for user {userId}: {error}', { userId: user.id, error });
    return internalError('Failed to list invitations');
  }
};

export const createPracticeInvitation = async (
  organizationId: string,
  email: string,
  role: InvitationRole,
  user: User,
  requestHeaders: Record<string, string>,
): Promise<Result<{ success: boolean; invitationId: string }>> => {
  try {
    const betterAuth = getBetterAuth();
    const result = await betterAuth.api.createInvitation({
      body: {
        organizationId,
        email,
        role,
      },
      headers: requestHeaders,
    });

    const invitationId = result?.id;

    if (!invitationId) {
      return internalError('Failed to create invitation - no invitation ID returned');
    }

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

    return ok({ success: true, invitationId });
  } catch (error) {
    logger.error('Failed to create invitation for organization {organizationId}: {error}', { organizationId, error });
    return internalError(getBetterAuthErrorMessage(error, 'Failed to create invitation'));
  }
};

export const acceptPracticeInvitation = async (
  invitationId: string,
  user: User,
  requestHeaders: Record<string, string>,
): Promise<Result<{ success: boolean; organization: any }>> => {
  try {
    const betterAuth = getBetterAuth();
    const result = await betterAuth.api.acceptInvitation({
      body: { invitationId },
      headers: requestHeaders,
    });

    if (!result || !result.invitation) {
      return internalError('Failed to accept invitation');
    }

    const organizationId = result.invitation.organizationId;

    if (!organizationId) {
      return internalError('Organization ID not found in invitation result');
    }

    const orgResult = await getFullOrganization(organizationId, user, requestHeaders);

    void publishSimpleEvent(
      EventType.PRACTICE_MEMBER_JOINED,
      user.id,
      organizationId,
      {
        invitation_id: invitationId,
      },
    );

    void reportMeteredUsage(db, organizationId, METERED_TYPES.USER_SEAT, 1);

    return ok({ success: true, organization: orgResult.success ? orgResult.data : null });
  } catch (error) {
    logger.error('Failed to accept invitation {invitationId}: {error}', { invitationId, error });
    return internalError(getBetterAuthErrorMessage(error, 'Failed to accept invitation'));
  }
};
