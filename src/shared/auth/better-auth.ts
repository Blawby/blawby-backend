import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { bearer, organization, jwt } from 'better-auth/plugins';
import { eq, and } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import * as schema from '@/schema';
import { EventType } from '@/shared/events/enums/event-types';
import { publishSimpleEvent } from '@/shared/events/event-publisher';
import { sanitizeError } from '@/shared/utils/logging';

// Singleton Better Auth instance
let authInstance: ReturnType<typeof betterAuthInstance> | null = null;

/**
 * Create Better Auth instance with database connection
 * This is the core auth instance without framework-specific wrappers
 */
const betterAuthInstance = (
  db: NodePgDatabase<typeof schema>,
  // oxlint-disable-next-line explicit-function-return-type
) => {
  return betterAuth({
    secret: process.env.BETTER_AUTH_SECRET,

    // Connect to database via Drizzle adapter with schema
    database: drizzleAdapter(db, {
      provider: 'pg',
      schema,
      usePlural: true,
    }),

    // Plugins
    plugins: [bearer(), jwt(), organization()],

    // Base path for auth routes
    basePath: '/api/auth',

    // Database hooks for session management
    databaseHooks: {
      user: {
        create: {
          after: async (userData: {
            id: string;
            email: string;
            name: string;
            [key: string]: unknown;
          }) => {
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
          before: async (sessionData: {
            userId: string;
            [key: string]: unknown;
          }) => {
            // Get last active organization
            const lastActiveSession = await db
              .select({
                activeOrganizationId: schema.sessions.activeOrganizationId,
              })
              .from(schema.sessions)
              .where(eq(schema.sessions.userId, sessionData.userId))
              .limit(1);

            // Delete old sessions (maximumSessions: 1)
            await db
              .delete(schema.sessions)
              .where(eq(schema.sessions.userId, sessionData.userId));

            // Determine active organization
            let activeOrganizationId: string | null = null;

            try {
              if (
                lastActiveSession.length > 0
                && lastActiveSession[0].activeOrganizationId
              ) {
                // Validate that the previous active organization still exists and user has access
                const orgValidation = await db
                  .select({ id: schema.organizations.id })
                  .from(schema.organizations)
                  .innerJoin(
                    schema.members,
                    eq(schema.organizations.id, schema.members.organizationId),
                  )
                  .where(
                    and(
                      eq(
                        schema.organizations.id,
                        lastActiveSession[0].activeOrganizationId,
                      ),
                      eq(schema.members.userId, sessionData.userId),
                    ),
                  )
                  .limit(1);

                if (orgValidation.length > 0) {
                  activeOrganizationId
                    = lastActiveSession[0].activeOrganizationId;
                }
              }

              // If no valid active organization from previous session, get first available
              if (!activeOrganizationId) {
                const userOrgs = await db
                  .select({ organizationId: schema.members.organizationId })
                  .from(schema.members)
                  .where(eq(schema.members.userId, sessionData.userId))
                  .limit(1);

                if (userOrgs.length > 0) {
                  activeOrganizationId = userOrgs[0].organizationId;
                }
              }
            } catch (error) {
              console.warn('Failed to set active organization:', error);
            }

            return { data: { ...sessionData, activeOrganizationId } };
          },
          after: async (sessionData: {
            userId: string;
            id: string;
            activeOrganizationId?: string;
            [key: string]: unknown;
          }) => {
            await publishSimpleEvent(EventType.AUTH_USER_LOGGED_IN,
              sessionData.userId,
              sessionData.activeOrganizationId || undefined,
              {
                user_id: sessionData.userId,
                session_id: sessionData.id,
                active_organization_id: sessionData.activeOrganizationId || undefined,
                login_method: 'email',
              });
          },
        },
      },
    },

    // Session configuration
    session: {
      expiresIn: 60 * 60 * 24, // 24 hours
      updateAge: 60 * 60, // 1 hour
      freshAge: 60 * 60 * 24, // 24 hours
    },

    // Email & Password settings
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
      minPasswordLength: 8,
      maxPasswordLength: 128,
    },


    // Organization settings
    organization: {
      enabled: true,
      allowPersonalAccounts: true,
      requireActiveOrganization: false,
    },

    // Error handling
    onAPIError: {
      throw: false,
      onError: (error: unknown, context?: Record<string, unknown>): void => {
        const sanitizedError = sanitizeError(error);
        console.error('Better Auth error:', sanitizedError, context);
      },
    },

    // Advanced settings
    advanced: {
      database: { generateId: () => crypto.randomUUID() },
      // Always use secure cookies in production, but allow non-secure for local dev
      useSecureCookies: process.env.NODE_ENV === 'production',

      // Cookie attributes for cross-origin support (local frontend to deployed backend)
      defaultCookieAttributes: {
        // Use 'lax' for development (local to remote works fine with lax)
        // Use 'none' only in production if you need cross-domain
        sameSite: process.env.NODE_ENV === 'production' ? 'lax' : 'lax',

        // Secure only in production
        secure: process.env.NODE_ENV === 'production',

        httpOnly: true,
        path: '/',
      },
    },

    // Trusted origins - include all possible frontend locations
    trustedOrigins: (request: Request): string[] => {
      const origin = request.headers.get('origin');
      if (!origin) return [];

      // Allow all localhost origins (any port)
      const localhostPattern = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
      if (localhostPattern.test(origin)) {
        return [origin];
      }


      return [origin];
    },
  });
};

/**
 * Get or create Better Auth instance (singleton pattern)
 */
export const createBetterAuthInstance = (
  db: NodePgDatabase<typeof schema>,
  // oxlint-disable-next-line explicit-function-return-type
) => {
  if (!authInstance) {
    authInstance = betterAuthInstance(db);
  }
  return authInstance;
};

export type BetterAuthInstance = ReturnType<typeof betterAuthInstance>;
