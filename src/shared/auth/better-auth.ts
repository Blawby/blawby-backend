import { getLogger } from '@logtape/logtape';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { admin, anonymous, magicLink, organization, testUtils } from 'better-auth/plugins';
import { eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
// Schema is used as namespace for drizzle adapter
// oxlint-disable-next-line no-namespace
import * as schema from '@/schema';
import { AUTH_CONFIG } from '@/shared/auth/config/authConfig';
import { config } from '@/shared/config';
import { createDatabaseHooks } from '@/shared/auth/hooks/databaseHooks';
import { organizationAccessController, organizationRoles } from '@/shared/auth/organizationRoles';
import { createStripePlugin } from '@/shared/auth/plugins/stripe.config';
import { linkAnonymousUserData } from '@/shared/auth/services/link-user-data.service';
import { getTrustedOrigins } from '@/shared/auth/utils/trustedOrigins';
import { InvitationAccepted, PracticeMemberInvited } from '@/shared/events/definitions';
import { queueManager } from '@/shared/queue/queue.manager';
import { EMAIL_TEMPLATES } from '@/shared/services/email/email.types';
import type { PrefillData } from '@/shared/types/prefill';
import { getMatchingFrontendUrl, isDevelopment, isProductionLike } from '@/shared/utils/env';
import { sanitizeError } from '@/shared/utils/logging';

const logger = getLogger(['shared', 'auth', 'better-auth']);
const authSessionAdditionalFields =
  // oxlint-disable-next-line no-unsafe-type-assertion
  (AUTH_CONFIG.session as { additionalFields?: Record<string, unknown> }).additionalFields ?? {};

/**
 * Internal factory to define the Better Auth configuration.
 * Used for type inference without executing betterAuth() at import time.
 */
const betterAuthConfig = (db: NodePgDatabase<typeof schema>, googleRedirectUri?: string) =>
  betterAuth({
    secret: config.auth.betterAuthSecret,
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

          const frontendUrl = getMatchingFrontendUrl();
          // Queue the invitation email
          await queueManager.addEmailJob(
            'practice-invitation',
            data.email,
            `You've been invited to join ${practiceName} on Blawby`,
            {
              recipientEmail: data.email,
              recipientName: '', // Optional
              inviterName,
              practiceName,
              inviteLink: `${frontendUrl}/auth/accept-invitation?data=${encodedData}`,
            }
          );

          // Dispatch event for other modules to handle
          void PracticeMemberInvited.dispatch(
            {
              invitation_id: data.id,
              invited_email: data.email,
              role: data.role,
              organization_id: data.organization.id,
              inviter_id: data.inviter.userId,
            },
            {
              actorId: data.inviter.userId,
              organizationId: data.organization.id,
            }
          );
        },
      }),
      createStripePlugin(db),
      anonymous({
        onLinkAccount: async ({ anonymousUser, newUser }) => {
          await db
            .insert(schema.identityUpgradeClaims)
            .values({
              anonUserId: anonymousUser.user.id,
              registeredUserId: newUser.user.id,
            })
            .onConflictDoNothing();

          await db
            .update(schema.sessions)
            .set({ previousAnonUserId: anonymousUser.user.id })
            .where(eq(schema.sessions.id, newUser.session.id));

          await linkAnonymousUserData({
            anonymousUser: { id: anonymousUser.user.id, email: anonymousUser.user.email },
            newUser: { id: newUser.user.id, email: newUser.user.email },
          });
        },
      }),
      admin(),
      magicLink({
        sendMagicLink: async ({ email, url }) => {
          await queueManager.addEmailJob('magic-link', email, 'Sign in to Blawby', {
            url,
            year: new Date().getFullYear(),
          });
        },
      }),
      ...(config.env.isTest ? [testUtils()] : []),
    ],
    baseURL: config.app.baseUrl || undefined,
    basePath: '/api/auth',
    rateLimit: {
      enabled: true,
      window: 60, // Seconds
      max: 100, // Requests per window (default)
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
      useSecureCookies: true,
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
            sameSite: 'none',
            secure: true,
          },
        },
      },
    },
    databaseHooks: createDatabaseHooks(db),
    session: {
      ...AUTH_CONFIG.session,
      additionalFields: {
        ...authSessionAdditionalFields,
        previousAnonUserId: {
          type: 'string',
          required: false,
        },
      },
    },
    emailVerification: {
      sendVerificationEmail: async ({ user, url }) => {
        await queueManager.addEmailJob(EMAIL_TEMPLATES.EMAIL_VERIFICATION, user.email, 'Verify your email address', {
          url,
          year: new Date().getFullYear(),
        });
      },
    },
    user: {
      changeEmail: {
        enabled: true,
        sendChangeEmailConfirmation: async ({ user, newEmail, url }) => {
          await queueManager.addEmailJob(
            EMAIL_TEMPLATES.CHANGE_EMAIL_CONFIRMATION,
            user.email,
            'Confirm your email change',
            {
              newEmail,
              url,
              year: new Date().getFullYear(),
            }
          );
        },
      },
      deleteUser: {
        enabled: true,
      },
      additionalFields: {
        primaryWorkspace: {
          type: ['public', 'client', 'practice'],
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
          defaultValue: false,
        },
      },
    },
    emailAndPassword: {
      ...AUTH_CONFIG.emailAndPassword,
      sendResetPassword: async ({ user, url }) => {
        await queueManager.addEmailJob(EMAIL_TEMPLATES.PASSWORD_RESET, user.email, 'Reset your Blawby password', {
          url,
          year: new Date().getFullYear(),
        });
      },
    },
    socialProviders: {
      google: {
        clientId: config.auth.googleClientId!,
        clientSecret: config.auth.googleClientSecret,
        // Allow overriding the redirect URI per-instance (runtime selection).
        redirectURI: googleRedirectUri ?? config.auth.googleRedirectUri,
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

/**
 * Map of Better Auth instances keyed by redirect URI (use 'default' for none).
 * This allows creating per-redirectURI instances while still reusing instances
 * when the same redirectURI is requested repeatedly.
 */
const authInstances = new Map<string, ReturnType<typeof betterAuthConfig>>();

/**
 * Factory function to create or retrieve a Better Auth instance for a given
 * optional Google redirect URI.
 */
export const createBetterAuthInstance = (
  db: NodePgDatabase<typeof schema>,
  googleRedirectUri?: string
): ReturnType<typeof betterAuthConfig> => {
  const key = googleRedirectUri ?? 'default';
  if (!authInstances.has(key)) {
    authInstances.set(key, betterAuthConfig(db, googleRedirectUri));
  }
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  return authInstances.get(key)!;
};

export const auth = createBetterAuthInstance;

/**
 * BetterAuthInstance type derived from the config factory.
 * This ensures full plugin type inference without executing betterAuth at import time.
 */
export type BetterAuthInstance = ReturnType<typeof betterAuthConfig>;
