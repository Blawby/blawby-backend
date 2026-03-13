/**
 * Routing Service
 *
 * Computes workspace routing claims based on user session, membership, and entitlements.
 * This is server-derived per-request computation, not stored data.
 */

import { getLogger } from '@logtape/logtape';
import { eq, and } from 'drizzle-orm';
import { PRACTICE_ENTITLED_STATUSES } from '@/modules/subscriptions/constants/subscriptionStatuses';
import { organizations, members, subscriptions } from '@/schema/better-auth-schema';
import { db } from '@/shared/database';

const logger = getLogger(['auth', 'routing']);

export interface WorkspaceAccess {
  practice: boolean;
  client: boolean;
  public: boolean;
}

export interface RoutingClaims {
  workspace_access: WorkspaceAccess;
  default_workspace: 'practice' | 'client' | 'public';
  active_membership_role: string | null;
  practice_entitled: boolean;
}

/** Lightweight input types — only the fields routing actually needs */
export interface RoutingUserInput {
  id: string;
  isAnonymous: boolean;
  banned?: boolean | null;
}

export interface RoutingSessionInput {
  activeOrganizationId?: string | null;
}

export interface RoutingContext {
  user: RoutingUserInput;
  session: RoutingSessionInput | null;
}

/**
 * Check if user has practice entitlement based on subscription status
 */
const hasPracticeEntitlement = async (organizationId: string | null): Promise<boolean> => {
  if (!organizationId) return false;

  try {
    const [subscription] = await db
      .select({
        status: subscriptions.status,
      })
      .from(organizations)
      .innerJoin(subscriptions, eq(organizations.activeSubscriptionId, subscriptions.id))
      .where(eq(organizations.id, organizationId))
      .limit(1);

    if (!subscription) return false;

    // Use type-safe check: verify status is one of the entitled statuses
    // Using a type-safe include check by casting the const array to a string array
    return (PRACTICE_ENTITLED_STATUSES as readonly string[]).includes(subscription.status);
  } catch (error) {
    logger.error('Failed to check practice entitlement for org {orgId}: {error}', {
      orgId: organizationId,
      error,
    });
    return false;
  }
};

interface Membership {
  role: string;
}

/**
 * Get user's membership role in active organization
 */
const getActiveMembership = async (userId: string, organizationId: string | null): Promise<Membership | null> => {
  if (!organizationId) return null;

  try {
    const [membership] = await db
      .select({
        role: members.role,
      })
      .from(members)
      .where(and(eq(members.userId, userId), eq(members.organizationId, organizationId)))
      .limit(1);

    return membership;
  } catch (error) {
    logger.error('Failed to get membership for user {userId}, org {orgId}: {error}', {
      userId,
      orgId: organizationId,
      error,
    });
    return null;
  }
};

/**
 * Compute default workspace based on access flags
 */
const computeDefaultWorkspace = (access: WorkspaceAccess): 'practice' | 'client' | 'public' => {
  if (access.practice) return 'practice';
  if (access.client) return 'client';
  return 'public';
};

/**
 * Compute routing claims for a user session
 *
 * NOTE: Routing depends on session.activeOrganizationId being set by Better Auth
 * database hooks. If activeOrganizationId is null, user gets public-only access
 * regardless of other organization memberships.
 */
export const computeRoutingClaims = async (context: RoutingContext): Promise<RoutingClaims> => {
  const { user, session } = context;

  // Edge case: Anonymous user
  if (user.isAnonymous) {
    // POLICY NOTE: Anonymous users get only public access.
    // If you support authenticated-anonymous client onboarding flows,
    // you may want to set client=true for anonymous sessions.
    return {
      workspace_access: {
        practice: false,
        client: false,
        public: user.banned !== true,
      },
      default_workspace: 'public',
      active_membership_role: null,
      practice_entitled: false,
    };
  }

  // Get active organization context
  const activeOrganizationId = session?.activeOrganizationId || null;

  // Early return: no organization context means no membership or entitlement checks needed
  if (!activeOrganizationId) {
    return {
      workspace_access: {
        practice: false,
        client: false,
        public: user.banned !== true,
      },
      default_workspace: 'public',
      active_membership_role: null,
      practice_entitled: false,
    };
  }

  const membership = await getActiveMembership(user.id, activeOrganizationId);
  const membershipRole = membership?.role || null;

  // Safety check: treat unknown/empty roles as lowest privilege (no workspace access)
  if (membership && (typeof membershipRole !== 'string' || membershipRole.trim() === '')) {
    logger.warn('User {userId} has membership with invalid role, treating as no access', {
      userId: user.id,
      organizationId: activeOrganizationId,
      membershipRole: membershipRole,
      membershipRoleType: typeof membershipRole,
    });
    return {
      workspace_access: {
        practice: false,
        client: false,
        public: user.banned !== true,
      },
      default_workspace: 'public',
      active_membership_role: null,
      practice_entitled: false,
    };
  }

  // Check practice entitlement
  const practiceEntitled = await hasPracticeEntitlement(activeOrganizationId);

  // Compute workspace access based on rules
  const workspace_access: WorkspaceAccess = {
    // Practice access: not anonymous + membership + non-client role + entitlement
    practice: !user.isAnonymous && Boolean(membership) && membershipRole !== 'client' && practiceEntitled,

    // Client access: actual client roles OR non-entitled staff fallback
    client:
      !user.isAnonymous &&
      Boolean(membership) &&
      (membershipRole === 'client' || (!practiceEntitled && membershipRole !== 'client')),

    // Public access: allowed unless explicitly banned
    public: user.banned !== true,
  };

  const default_workspace = computeDefaultWorkspace(workspace_access);

  logger.debug('Computed routing claims for user {userId}', {
    userId: user.id,
    isAnonymous: user.isAnonymous,
    activeOrganizationId,
    membershipRole,
    practiceEntitled,
    workspace_access,
    default_workspace,
  });

  return {
    workspace_access,
    default_workspace,
    active_membership_role: membershipRole,
    practice_entitled: practiceEntitled,
  };
};
