import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { bearer, organization } from 'better-auth/plugins';
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
    ],
    baseURL: process.env.BETTER_AUTH_BASE_URL!,
    basePath: '/api/auth',
    advanced: {
      database: {
        // Force UUID generation to match database schema (uuid type with hyphens)
        generateId: () => crypto.randomUUID(),
      },
      // Disable origin check in development to allow cURL and server-to-server requests
      disableOriginCheck: process.env.NODE_ENV === 'development',
    },
    databaseHooks: createDatabaseHooks(db),
    session: AUTH_CONFIG.session,
    emailAndPassword: AUTH_CONFIG.emailAndPassword,
    organization: AUTH_CONFIG.organization,
    onAPIError: {
      throw: false,
      onError: (error: unknown, context?: Record<string, unknown>) => {
        const sanitized = sanitizeError(error);
        console.error('Better Auth error:', sanitized, context);
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

export type BetterAuthInstance = ReturnType<typeof betterAuthInstance>;
