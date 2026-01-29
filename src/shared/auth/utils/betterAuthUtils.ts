/**
 * Type guard to check if a value is a record (object with string keys)
 */
const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
};

/**
 * Helper to extract a user-friendly error message from Better Auth API errors.
 * Better Auth API errors typically return an object with a 'body' containing the message.
 */
const getBetterAuthErrorMessage = (error: unknown, defaultMessage: string = 'Operation failed'): string => {
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
 * Checks if a Better Auth error is a Forbidden/Unauthorized error.
 */
const isBetterAuthForbidden = (error: unknown): boolean => {
  if (!isRecord(error)) {
    return false;
  }

  const status = error.status ?? error.statusCode;
  return status === 403 || status === 'FORBIDDEN' || status === 401 || status === 'UNAUTHORIZED';
};

/**
 * Safely parses Better Auth metadata, which is often stringified JSON.
 */
const parseBetterAuthMetadata = <T = unknown>(metadata: unknown): T | null => {
  if (!metadata) return null;

  if (typeof metadata === 'string') {
    try {
      return JSON.parse(metadata) as T;
    } catch {
      return null;
    }
  }

  return metadata as T;
};

const betterAuthUtils = {
  getBetterAuthErrorMessage,
  isBetterAuthForbidden,
  parseBetterAuthMetadata,
};

export default betterAuthUtils;
