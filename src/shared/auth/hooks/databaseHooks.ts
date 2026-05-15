/**
 * Database Hooks for Better Auth
 *
 * Handles database-level events (user creation, session management).
 *
 * Customization scope (issue #571 auth-routing cleanup, 2026-05-15):
 *   This file used to:
 *     1. Auto-add new users as `member.role='client'` on signup when their
 *        email matched a "succeeded" intake — bypassing better-auth's
 *        documented invite + accept flow.
 *     2. Auto-set `session.activeOrganizationId` from the user's prior
 *        session or first membership — bypassing better-auth's documented
 *        `authClient.organization.setActive()` flow.
 *
 *   Both auto-behaviors produced inconsistent state where a user's
 *   `user.primary_workspace='practice'` could coexist with
 *   `member.role='client'` in the auto-picked active org, and the worker
 *   plus frontend then routed the user to /client/ workspaces.
 *
 *   Per the documented better-auth flow:
 *     - Clients only become members by accepting an invitation
 *       (POST /organization/accept-invitation).
 *     - The active organization is set by the client via
 *       authClient.organization.setActive(orgId).
 */

import { eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '@/schema';
import { AuthUserSignedUp } from '@/shared/events/definitions';

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
      // Enforce one session per user (the platform invariant we still want).
      // Do NOT auto-fill activeOrganizationId here — the client app is
      // responsible for calling authClient.organization.setActive() after
      // sign-in, per the better-auth organization plugin docs.
      before: async (sessionData: SessionData): Promise<{ data: SessionData }> => {
        await db.delete(schema.sessions).where(eq(schema.sessions.userId, sessionData.userId));
        return { data: sessionData };
      },
    },
  },
});
