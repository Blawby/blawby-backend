/**
 * Better Auth Configuration Constants
 */

export const AUTH_CONFIG = {
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
} as const;

