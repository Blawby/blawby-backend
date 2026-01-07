import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { anonymous, bearer, organization } from 'better-auth/plugins';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '@/schema';
import { AUTH_CONFIG } from '@/shared/auth/config/authConfig';
import { createDatabaseHooks } from '@/shared/auth/hooks/databaseHooks';
import { organizationAccessController, organizationRoles } from '@/shared/auth/organizationRoles';
import { createStripePlugin } from '@/shared/auth/plugins/stripe.config';
import { getTrustedOrigins } from '@/shared/auth/utils/trustedOrigins';
import { sanitizeError } from '@/shared/utils/logging';

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
      bearer(),
      organization({
        ac: organizationAccessController,
        roles: organizationRoles,
      }),
      createStripePlugin(db),
      anonymous(),
    ],
    baseURL: process.env.BASE_URL!,
    basePath: '/api/auth',
    advanced: {
      database: {
        generateId: 'uuid',
      },
      useSecureCookies: process.env.NODE_ENV === 'production',
      // Disable origin check in development to allow cURL and server-to-server requests
      disableOriginCheck: process.env.NODE_ENV === 'development',
      cookie: {
        // CRITICAL: Allow cookie sharing across subdomains
        domain: ".blawby.com",
        secure: true,
        sameSite: "none",
      }
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
      },
    },
    socialProviders: {
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID!,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
        redirectURI: process.env.GOOGLE_REDIRECT_URI,
      },
    },
    onAPIError: {
      throw: false,
      onError: (error: unknown, context?: Record<string, unknown>) => {
        const sanitized = sanitizeError(error);
        console.error('Better Auth error:', sanitized, context);
      },
    },
    trustedOrigins: getTrustedOrigins
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
