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
import { InvitationAccepted, PracticeMemberInvited } from '@/shared/events/definitions';
import { addEmailJob } from '@/shared/queue/queue.manager';
import type { PrefillData } from '@/shared/types/prefill';
import { isDevelopment, isProductionLike } from '@/shared/utils/env';
import { sanitizeError } from '@/shared/utils/logging';

const logger = getLogger(['shared', 'auth', 'better-auth']);

/**
 * Internal factory to define the Better Auth configuration.
 * Used for type inference without executing betterAuth() at import time.
 */
const betterAuthConfig = (db: NodePgDatabase<typeof schema>) => betterAuth({
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
      sendInvitationEmail: async (data) => {
        const practiceName = data.organization.name || 'the team';
        const inviterName = data.inviter.user.name || data.inviter.user.email;

        const prefillData: PrefillData = {
          type: 'invitation',
          id: data.id,
          email: data.email,
          orgName: practiceName,
          orgSlug: data.organization.slug,
          inviterName,
        };

        const encodedData = Buffer.from(JSON.stringify(prefillData)).toString('base64url');

        // Queue the invitation email
        await addEmailJob(
          'practice-invitation',
          data.email,
          `You've been invited to join ${practiceName} on Blawby`,
          {
            recipientEmail: data.email,
            recipientName: '', // Optional
            inviterName,
            practiceName,
            inviteLink: `${process.env.FRONTEND_URL}/auth/accept-invitation?data=${encodedData}`,
          },
        );

        // Dispatch event for other modules to handle
        void PracticeMemberInvited.dispatch({
          invitation_id: data.id,
          invited_email: data.email,
          role: data.role,
          organization_id: data.organization.id,
          inviter_id: data.inviter.userId,
        }, {
          actorId: data.inviter.userId,
          organizationId: data.organization.id,
        });
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
    disableCSRFCheck: isDevelopment(),
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
});

/**
 * BetterAuthInstance type derived from the config factory.
 * This ensures full plugin type inference without executing betterAuth at import time.
 */
export type BetterAuthInstance = ReturnType<typeof betterAuthConfig>;

/**
 * Singleton instance of Better Auth
 */
let authInstance: BetterAuthInstance | null = null;

/**
 * Singleton factory function to create or retrieve the Better Auth instance.
 */
export const createBetterAuthInstance = (
  db: NodePgDatabase<typeof schema>,
): BetterAuthInstance => {
  if (!authInstance) {
    authInstance = betterAuthConfig(db);
  }
  return authInstance;
};

export const auth = createBetterAuthInstance;
