import { getLogger } from '@logtape/logtape';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import {
  admin, anonymous, magicLink, organization,
} from 'better-auth/plugins';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '@/schema';
import { AUTH_CONFIG } from '@/shared/auth/config/authConfig';
import { createDatabaseHooks } from '@/shared/auth/hooks/databaseHooks';
import { organizationAccessController, organizationRoles } from '@/shared/auth/organizationRoles';
import { createStripePlugin } from '@/shared/auth/plugins/stripe.config';
import { linkAnonymousUserData } from '@/shared/auth/services/link-user-data.service';
import { getTrustedOrigins } from '@/shared/auth/utils/trustedOrigins';
import { InvitationAccepted } from '@/shared/events/definitions';
import { addEmailJob } from '@/shared/queue/queue.manager';
import { isDevelopment, isProductionLike } from '@/shared/utils/env';
import { sanitizeError } from '@/shared/utils/logging';

const logger = getLogger(['shared', 'auth', 'better-auth']);

/**
 * Dummy instance for type inference only - defined first so BetterAuthInstance
 * can be used to type authInstance below.
 */
const _auth = betterAuth({
  database: drizzleAdapter({} as NodePgDatabase<typeof schema>, { provider: 'pg' }),
  plugins: [
    organization({
      ac: organizationAccessController,
      roles: organizationRoles,
    }),
    createStripePlugin({} as NodePgDatabase<typeof schema>),
    anonymous({}),
    admin(),
    magicLink({
      sendMagicLink: async () => { },
    }),
  ],
  user: {
    additionalFields: {
      primaryWorkspace: {
        type: ['client', 'practice'],
        required: false,
      },
      phone: {
        type: 'string',
        required: false,
      },
      phoneCountryCode: {
        type: 'string',
        required: false,
      },
      dob: {
        type: 'date',
        required: false,
      },
      isAnonymous: {
        type: 'boolean',
        required: false,
      },
      onboardingComplete: {
        type: 'boolean',
        required: false,
        defaultValue: true,
      },
    },
  },
});

export type BetterAuthInstance = typeof _auth;

let authInstance: BetterAuthInstance | null = null;

export const createBetterAuthInstance = (
  db: NodePgDatabase<typeof schema>,
): BetterAuthInstance => {
  if (!authInstance) {
    authInstance = betterAuth({
      secret: process.env.BETTER_AUTH_SECRET!,
      database: drizzleAdapter(db, {
        provider: 'pg',
        schema,
        usePlural: true,
      }),
      plugins: [
        organization({
          ac: organizationAccessController,
          roles: organizationRoles,
          allowPersonalAccounts: true, // Consolidated from AUTH_CONFIG
          hooks: {
            afterAcceptInvitation: async (data: {
              invitation: { id: string; organizationId: string };
              member: { role: string };
              user: { id: string; email: string };
            }) => {
              // Dispatch event for other modules (User Details) to handle
              void InvitationAccepted.dispatch({
                invitationId: data.invitation.id,
                organizationId: data.invitation.organizationId,
                userId: data.user.id,
                email: data.user.email,
                role: data.member.role,
              });
            },
          },
        }),
        createStripePlugin(db),
        anonymous({
          onLinkAccount: async ({ anonymousUser, newUser }) => {
            await linkAnonymousUserData({
              anonymousUser: { id: anonymousUser.user.id, email: anonymousUser.user.email },
              newUser: { id: newUser.user.id, email: newUser.user.email },
            });
          },
        }),
        admin(),
        magicLink({
          sendMagicLink: async ({ email, url }) => {
            await addEmailJob(
              'magic-link',
              email,
              'Sign in to Blawby',
              { url, year: new Date().getFullYear() },
            );
          },
        }),
      ],
      baseURL: process.env.BASE_URL!,
      basePath: '/api/auth',
      rateLimit: {
        enabled: true,
        window: 60, // seconds
        max: 100, // requests per window (default)
        storage: 'database', // Use PostgreSQL instead of memory
        customRules: {
          '/sign-in/email': {
            window: 60,
            max: 5, // Stricter for sign-in (prevent brute force)
          },
          '/sign-up/email': {
            window: 60,
            max: 3, // Even stricter for sign-up
          },
          '/reset-password': {
            window: 300, // 5 minutes
            max: 3,
          },
        },
      },
      advanced: {
        database: {
          generateId: 'uuid',
        },
        useSecureCookies: !isDevelopment(),
        // Disable origin check in development to allow cURL and server-to-server requests
        disableOriginCheck: isDevelopment(),
        crossSubDomainCookies: {
          enabled: isProductionLike(),
          domain: isProductionLike() ? '.blawby.com' : undefined,
        },
        cookies: {
          // CRITICAL: Allow cookie sharing across subdomains
          session_token: {
            name: 'better-auth.session_token',
            attributes: {
              domain: isProductionLike() ? '.blawby.com' : undefined,
              sameSite: isProductionLike() ? 'none' : 'lax',
            },
          },
        },
      },
      databaseHooks: createDatabaseHooks(db),
      session: AUTH_CONFIG.session,
      emailAndPassword: AUTH_CONFIG.emailAndPassword,
      user: {
        additionalFields: {
          primaryWorkspace: {
            type: ['client', 'practice'],
            required: false,
          },
          phone: {
            type: 'string',
            required: false,
          },
          phoneCountryCode: {
            type: 'string',
            required: false,
          },
          dob: {
            type: 'date',
            required: false,
          },
          isAnonymous: {
            type: 'boolean',
            required: false,
          },
          onboardingComplete: {
            type: 'boolean',
            required: false,
            defaultValue: true,
          },
        },
      },
      socialProviders: {
        google: {
          clientId: process.env.GOOGLE_CLIENT_ID!,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
          redirectURI: process.env.GOOGLE_REDIRECT_URI,
        },
      },
      logger: {
        level: isDevelopment() ? 'debug' : 'info',
        log: (level: 'debug' | 'info' | 'warn' | 'error', message: string, ...args: unknown[]) => {
          const props = args.length > 0 ? { data: args } : undefined;
          switch (level) {
            case 'error':
              logger.error(message, props);
              break;
            case 'warn':
              logger.warn(message, props);
              break;
            case 'info':
              logger.info(message, props);
              break;
            case 'debug':
              logger.debug(message, props);
              break;
          }
        },
      },
      onAPIError: {
        throw: false,
        onError: (error: unknown, context?: Record<string, unknown>) => {
          const sanitized = sanitizeError(error);
          logger.error('Better Auth error: {error}', { error: sanitized, context });
        },
      },
      trustedOrigins: getTrustedOrigins,
    }) as BetterAuthInstance;
  }
  return authInstance;
};

export const auth = createBetterAuthInstance;
