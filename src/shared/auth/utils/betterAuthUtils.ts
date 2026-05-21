import { config } from '@/shared/config';

/**
 * Type guard to check if a value is a record (object with string keys)
 */
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Helper to extract a user-friendly error message from Better Auth API errors.
 * Better Auth API errors typically return an object with a 'body' containing the message.
 */
const getBetterAuthErrorMessage = (error: unknown, defaultMessage = 'Operation failed'): string => {
  if (!isRecord(error)) {
    return defaultMessage;
  }

  // Better Auth API errors often have a body with a message property
  if (isRecord(error.body) && typeof error.body.message === 'string') {
    return error.body.message;
  }

  // Fallback to standard error message if available
  if (typeof error.message === 'string') {
    return error.message;
  }

  return defaultMessage;
};

/**
 * Safely parses Better Auth metadata, which is often stringified JSON.
 */
const parseBetterAuthMetadata = <T = unknown>(metadata: unknown): T | null => {
  if (!metadata) {
    return null;
  }

  if (typeof metadata === 'string') {
    try {
      return JSON.parse(metadata) as T;
    } catch {
      return null;
    }
  }

  return metadata as T;
};

/**
 * Checks if an error is a "Forbidden" error from Better Auth.
 */
const isBetterAuthForbidden = (error: unknown): boolean => {
  if (!isRecord(error)) {
    return false;
  }

  // Better Auth often returns 403 for forbidden
  if (error.status === 403) {
    return true;
  }

  // Also check body for forbidden message or code
  if (isRecord(error.body)) {
    if (typeof error.body.code === 'string' && error.body.code.includes('FORBIDDEN')) {
      return true;
    }
    if (typeof error.body.message === 'string' && error.body.message.toLowerCase().includes('forbidden')) {
      return true;
    }
  }

  return false;
};

/**
 * Determine the appropriate Google redirect URI based on the request host.
 * Supports separate configuration for local development, defaults to production/staging.
 */
const getGoogleRedirectUriForHost = (host?: string): string | undefined => {
  if (!host) {
    return config.auth.googleRedirectUri;
  }

  // Check if this is a local request
  if (host.includes('local') || host.startsWith('localhost')) {
    return config.auth.googleRedirectUriLocal;
  }

  // Default to production/staging URI
  return config.auth.googleRedirectUri;
};

const betterAuthUtils = {
  getBetterAuthErrorMessage,
  parseBetterAuthMetadata,
  isBetterAuthForbidden,
  getGoogleRedirectUriForHost,
};

export default betterAuthUtils;
