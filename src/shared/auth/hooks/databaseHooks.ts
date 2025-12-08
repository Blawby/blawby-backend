/**
 * Database Hooks for Better Auth
 *
 * Handles database-level events (user creation, session management)
 */

import { eq, and } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '@/schema';
import { EventType } from '@/shared/events/enums/event-types';
import { publishSimpleEvent } from '@/shared/events/event-publisher';

/**
 * Get active organization ID for a user
 * Tries to preserve last active organization, falls back to first organization
 */
const getActiveOrganizationId = async (
  db: NodePgDatabase<typeof schema>,
  userId: string,
  lastActiveOrgId: string | null,
): Promise<string | null> => {
  // First, try to use the last active organization if it's still valid
  if (lastActiveOrgId) {
    const orgValidation = await db
      .select({ id: schema.organizations.id })
      .from(schema.organizations)
      .innerJoin(
        schema.members,
        eq(schema.organizations.id, schema.members.organizationId),
      )
      .where(
        and(
          eq(schema.organizations.id, lastActiveOrgId),
          eq(schema.members.userId, userId),
        ),
      )
      .limit(1);

    if (orgValidation.length > 0) {
      return lastActiveOrgId;
    }
  }

  // Fall back to first organization user belongs to
  const userOrgs = await db
    .select({ organizationId: schema.members.organizationId })
    .from(schema.members)
    .where(eq(schema.members.userId, userId))
    .limit(1);

  return userOrgs.length > 0 ? userOrgs[0].organizationId : null;
};

type UserData = Record<string, unknown> & {
  id: string;
  email: string;
  name: string | null;
};

type SessionData = Record<string, unknown> & {
  userId: string;
  id: string;
};

/**
 * Create database hooks configuration
 */
export const createDatabaseHooks = (
  db: NodePgDatabase<typeof schema>,
): {
  user: {
    create: {
      after: (userData: UserData) => Promise<void>;
    };
  };
  session: {
    create: {
      before: (sessionData: SessionData) => Promise<{ data: SessionData & { activeOrganizationId: string | null } }>;
      after: (session: SessionData) => Promise<void>;
    };
  };
} => {
  return {
    user: {
      create: {
        after: async (userData: UserData): Promise<void> => {
          void publishSimpleEvent(EventType.AUTH_USER_SIGNED_UP, userData.id, undefined, {
            user_id: userData.id,
            email: userData.email,
            name: userData.name,
            signup_method: 'email',
          });
        },
      },
    },
    session: {
      create: {
        before: async (
          sessionData: SessionData,
        ): Promise<{ data: SessionData & { activeOrganizationId: string | null } }> => {
          // Get last active organization from previous session
          const lastActiveSession = await db
            .select({
              activeOrganizationId: schema.sessions.activeOrganizationId,
            })
            .from(schema.sessions)
            .where(eq(schema.sessions.userId, sessionData.userId))
            .limit(1);

          // Delete all existing sessions for this user (single session per user)
          await db
            .delete(schema.sessions)
            .where(eq(schema.sessions.userId, sessionData.userId));

          // Determine active organization
          let activeOrganizationId: string | null = null;
          try {
            activeOrganizationId = await getActiveOrganizationId(
              db,
              sessionData.userId,
              lastActiveSession.length > 0 ? lastActiveSession[0].activeOrganizationId : null,
            );
          } catch (error) {
            console.warn('Failed to set active organization:', error);
          }

          return {
            data: { ...sessionData, activeOrganizationId },
          };
        },
        after: async (session: SessionData): Promise<void> => {
          const activeOrgId = typeof session.activeOrganizationId === 'string'
            ? session.activeOrganizationId
            : undefined;

          void publishSimpleEvent(
            EventType.AUTH_USER_LOGGED_IN,
            session.userId,
            activeOrgId,
            {
              user_id: session.userId,
              session_id: session.id,
              active_organization_id: activeOrgId,
              login_method: 'email',
            },
          );
        },
      },
    },
  };
};

