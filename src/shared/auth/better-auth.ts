import { getLogger } from '@logtape/logtape';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import {
  anonymous, organization, admin, magicLink,
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

let authInstance: ReturnType<typeof betterAuthInstance> | null = null;

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
    plugins: [
      organization({
        ac: organizationAccessController,
        roles: organizationRoles,
        hooks: {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          afterAcceptInvitation: async (context: any) => {
            const {
              invitation, member, user,
            } = context;

            // Dispatch event for other modules (User Details) to handle
            void InvitationAccepted.dispatch({
              invitationId: invitation.id,
              organizationId: invitation.organizationId,
              userId: user.id,
              email: user.email,
              role: member.role,
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
        secure: isProductionLike(),
        sameSite: isProductionLike() ? 'none' : 'lax',
      },
      cookie: {
        // CRITICAL: Allow cookie sharing across subdomains
        domain: isProductionLike() ? '.blawby.com' : undefined,
        secure: isProductionLike(),
        sameSite: isProductionLike() ? 'none' : 'lax',
      },
    },
    databaseHooks: createDatabaseHooks(db),
    session: AUTH_CONFIG.session,
    emailAndPassword: AUTH_CONFIG.emailAndPassword,
    organization: AUTH_CONFIG.organization,
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
      enabled: true,
      level: isDevelopment() ? 'debug' : 'info',
      handler: (log: unknown) => {
        const { level, message, ...rest } = log as Record<string, unknown>;
        const msg = String(message);
        switch (level) {
          case 'error':
            logger.error(msg, rest);
            break;
          case 'warn':
            logger.warn(msg, rest);
            break;
          case 'info':
            logger.info(msg, rest);
            break;
          case 'debug':
            logger.debug(msg, rest);
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

export const auth = betterAuthInstance;

export type BetterAuthInstance = ReturnType<typeof betterAuthInstance>;
