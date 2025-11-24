import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { bearer, organization } from 'better-auth/plugins';
import { eq, and } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '@/schema';
import { EventType } from '@/shared/events/enums/event-types';
import { publishSimpleEvent } from '@/shared/events/event-publisher';
import { sanitizeError } from '@/shared/utils/logging';

let authInstance: ReturnType<typeof betterAuthInstance> | null = null;

/**
 * Check if origin matches a pattern (supports wildcards)
 */
const matchesPattern = (origin: string, pattern: string): boolean => {
  const regexPattern = pattern
    .replace(/\./g, '\\.')
    .replace(/\*/g, '.*');
  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(origin);
};


const betterAuthInstance = (
  db: NodePgDatabase<typeof schema>,
  // oxlint-disable-next-line explicit-function-return-type
) => {
  return betterAuth({
    secret: process.env.BETTER_AUTH_SECRET!,
    database: drizzleAdapter(db, {
      provider: 'pg',
      schema,
      usePlural: true,
    }),
    plugins: [bearer(), organization()],
    baseURL: process.env.BETTER_AUTH_BASE_URL!,
    basePath: '/api/auth',

    databaseHooks: {
      user: {
        create: {
          after: async (userData) => {
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
          before: async (sessionData) => {
            const lastActiveSession = await db
              .select({
                activeOrganizationId: schema.sessions.activeOrganizationId,
              })
              .from(schema.sessions)
              .where(eq(schema.sessions.userId, sessionData.userId))
              .limit(1);

            await db
              .delete(schema.sessions)
              .where(eq(schema.sessions.userId, sessionData.userId));

            let activeOrganizationId: string | null = null;

            try {
              if (
                lastActiveSession.length > 0
                && lastActiveSession[0].activeOrganizationId
              ) {
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
                  activeOrganizationId = lastActiveSession[0].activeOrganizationId;
                }
              }

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

            return {
              data: { ...sessionData, activeOrganizationId },
            };
          },
          after: async (sessionData) => {
            void publishSimpleEvent(
              EventType.AUTH_USER_LOGGED_IN,
              sessionData.userId,
              sessionData.activeOrganizationId || undefined,
              {
                user_id: sessionData.userId,
                session_id: sessionData.id,
                active_organization_id:
                  sessionData.activeOrganizationId || undefined,
                login_method: 'email',
              },
            );
          },
        },
      },
    },

    session: {
      expiresIn: 60 * 60 * 24, // 24 hours
      updateAge: 60 * 60, // 1 hour
      freshAge: 60 * 60 * 24, // 24 hours
    },

    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
      minPasswordLength: 8,
      maxPasswordLength: 128,
    },

    organization: {
      enabled: true,
      allowPersonalAccounts: true,
      requireActiveOrganization: false,
    },

    onAPIError: {
      throw: false,
      onError: (error: unknown, context?: Record<string, unknown>) => {
        const sanitized = sanitizeError(error);
        console.error('Better Auth error:', sanitized, context);
      },
    },

    trustedOrigins: (request) => {
      const origin = request.headers.get('origin');
      if (!origin) return [];
      const localhostPattern = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
      if (localhostPattern.test(origin)) {
        return [origin];
      }
      const allowed = process.env.ALLOWED_ORIGINS?.split(',').map((o) => o.trim()) || [];
      for (const a of allowed) {
        if (a === origin) return [origin];
        if (a.includes('*') && matchesPattern(origin, a)) {
          return [origin];
        }
      }
      return [];
    },
  });
};

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
