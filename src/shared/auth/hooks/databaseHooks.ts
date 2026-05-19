/**
 * Database Hooks for Better Auth
 *
 * Handles database-level events (user creation, session management).
 *
 * activeOrganizationId is intentionally NOT auto-set on session create.
 * The client app calls authClient.organization.setActive() after sign-in
 * per the better-auth organization plugin docs. Auto-setting it caused
 * inconsistent routing when primary_workspace didn't match the auto-picked org.
 */

import { getLogger } from '@logtape/logtape';
import { and, eq, sql } from 'drizzle-orm';
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

/**
 * When a client completes an intake anonymously then later authenticates with
 * the same email, enroll them in the org automatically. Sets primary_workspace
 * to 'client' so routing state is consistent with member.role='client'.
 */
const checkPendingIntakesByEmail = async ({ db, userId, email }: CheckPendingIntakesParams): Promise<void> => {
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
      const [newMember] = await db
        .insert(schema.members)
        .values({
          organizationId: intake.organization_id,
          userId,
          role: ROLE_CLIENT,
          createdAt: new Date(),
        })
        .onConflictDoNothing()
        .returning();

      if (newMember) {
        await db
          .update(schema.users)
          .set({ onboardingComplete: false, primaryWorkspace: ROLE_CLIENT })
          .where(eq(schema.users.id, userId));

        logger.info('Added user {userId} to organization {orgId} from pending intake {intakeId} (email match)', {
          userId,
          orgId: intake.organization_id,
          intakeId: intake.id,
        });

        try {
          await PracticeMemberJoined.dispatch(
            { member_id: newMember.id, intake_id: intake.id },
            { actorId: userId, organizationId: intake.organization_id }
          );
        } catch (dispatchError) {
          logger.error('Failed to dispatch PracticeMemberJoined for user {userId} intake {intakeId}: {error}', {
            userId,
            intakeId: intake.id,
            error: dispatchError,
          });
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
      before: (sessionData: SessionData) => Promise<{ data: SessionData }>;
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
          { actorId: userData.id, critical: true }
        );
      },
    },
  },
  session: {
    create: {
      // Enforce one session per user. Do NOT auto-fill activeOrganizationId —
      // client app calls authClient.organization.setActive() after sign-in.
      before: async (sessionData: SessionData): Promise<{ data: SessionData }> => {
        await db.delete(schema.sessions).where(eq(schema.sessions.userId, sessionData.userId));
        return { data: sessionData };
      },
      after: async (session: SessionData): Promise<void> => {
        try {
          const [user] = await db
            .select({ email: schema.users.email, isAnonymous: schema.users.isAnonymous })
            .from(schema.users)
            .where(eq(schema.users.id, session.userId))
            .limit(1);

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
