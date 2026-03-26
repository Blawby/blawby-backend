/**
 * Database Hooks for Better Auth
 *
 * Handles database-level events (user creation, session management)
 */

import { getLogger } from '@logtape/logtape';
import { eq, and, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { practiceClientIntakes } from '@/modules/practice-client-intakes/database/schema/practice-client-intakes.schema';
import * as schema from '@/schema';
import { AuthUserSignedUp, PracticeMemberJoined } from '@/shared/events/definitions';

const logger = getLogger(['auth', 'database-hooks']);

const INTAKE_STATUS_SUCCEEDED = 'succeeded';
const ROLE_CLIENT = 'client';

interface CheckPendingIntakesParams {
  db: NodePgDatabase<typeof schema>;
  userId: string;
  email: string;
}

interface GetActiveOrgParams {
  db: NodePgDatabase<typeof schema>;
  userId: string;
  lastActiveOrgId: string | null;
}

/**
 * Check for pending intakes by email and add user to organization.
 * This handles the case where anonymous session was lost but user authenticates
 * with the same email they used during intake.
 */
const checkPendingIntakesByEmail = async ({ db, userId, email }: CheckPendingIntakesParams): Promise<void> => {
  // Find succeeded intakes matching this email that haven't been processed
  const pendingIntakes = await db
    .select()
    .from(practiceClientIntakes)
    .where(
      and(
        eq(practiceClientIntakes.status, INTAKE_STATUS_SUCCEEDED),
        eq(sql<string>`lower(${practiceClientIntakes.metadata} ->> 'email')`, email.toLowerCase())
      )
    );

  for (const intake of pendingIntakes) {
    try {
      // Add user to organization as client (Atomic insert using unique constraint)
      const [newMember] = await db
        .insert(schema.members)
        .values({
          organizationId: intake.organization_id,
          userId: userId,
          role: ROLE_CLIENT,
          createdAt: new Date(),
        })
        .onConflictDoNothing()
        .returning();

      if (newMember) {
        // Mark user as needing onboarding
        await db.update(schema.users).set({ onboardingComplete: false }).where(eq(schema.users.id, userId));

        logger.info('Added user {userId} to organization {orgId} from pending intake {intakeId} (email match)', {
          userId,
          orgId: intake.organization_id,
          intakeId: intake.id,
        });

        // Dispatch event with error handling
        try {
          await PracticeMemberJoined.dispatch(
            {
              member_id: newMember.id,
              intake_id: intake.id,
            },
            {
              actorId: userId,
              organizationId: intake.organization_id,
            }
          );
        } catch (dispatchError) {
          logger.error(
            'Failed to dispatch PracticeMemberJoined event for user {userId} and intake {intakeId}: {error}',
            {
              userId,
              intakeId: intake.id,
              error: dispatchError,
            }
          );
        }
      }
    } catch (error) {
      logger.error('Failed to process pending intake {intakeId} for user {userId}: {error}', {
        intakeId: intake.id,
        userId,
        error,
      });
    }
  }
};

/**
 * Get active organization ID for a user
 * Tries to preserve last active organization, falls back to first organization
 */
const getActiveOrganizationId = async ({ db, userId, lastActiveOrgId }: GetActiveOrgParams): Promise<string | null> => {
  // First, try to use the last active organization if it's still valid
  if (lastActiveOrgId) {
    const orgValidation = await db
      .select({ id: schema.organizations.id })
      .from(schema.organizations)
      .innerJoin(schema.members, eq(schema.organizations.id, schema.members.organizationId))
      .where(and(eq(schema.organizations.id, lastActiveOrgId), eq(schema.members.userId, userId)))
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
  isAnonymous?: boolean;
};

type SessionData = Record<string, unknown> & {
  userId: string;
  id: string;
};

/**
 * Create database hooks configuration
 */
export const createDatabaseHooks = (
  db: NodePgDatabase<typeof schema>
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
} => ({
    user: {
      create: {
        after: async (userData: UserData): Promise<void> => {
          await AuthUserSignedUp.dispatch(
            {
              actor_id: userData.id,
              user_id: userData.id,
              email: userData.email,
              name: userData.name,
              signup_method: 'email',
              is_anonymous: userData.isAnonymous ?? false,
            },
            { actorId: userData.id }
          );
        },
      },
    },
    session: {
      create: {
        before: async (
          sessionData: SessionData
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
          await db.delete(schema.sessions).where(eq(schema.sessions.userId, sessionData.userId));

          // Determine active organization
          let activeOrganizationId: string | null = null;
          try {
            activeOrganizationId = await getActiveOrganizationId({
              db,
              userId: sessionData.userId,
              lastActiveOrgId: lastActiveSession.length > 0 ? lastActiveSession[0].activeOrganizationId : null,
            });
          } catch (error) {
            logger.warn('Failed to set active organization', { error });
          }

          return {
            data: { ...sessionData, activeOrganizationId },
          };
        },
        after: async (session: SessionData): Promise<void> => {
          // Check for pending intakes by email (handles lost anonymous session case)
          try {
            const [user] = await db
              .select({ email: schema.users.email, isAnonymous: schema.users.isAnonymous })
              .from(schema.users)
              .where(eq(schema.users.id, session.userId))
              .limit(1);

            // Only check for non-anonymous users (anonymous users are handled by onLinkAccount)
            if (user && !user.isAnonymous) {
              await checkPendingIntakesByEmail({ db, userId: session.userId, email: user.email });
            }
          } catch (error) {
            logger.error('Failed to check pending intakes for session {sessionId}: {error}', {
              sessionId: session.id,
              error,
            });
          }
        },
      },
    },
  });
