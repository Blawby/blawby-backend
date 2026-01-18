/**
 * Helper to extract a user-friendly error message from Better Auth API errors.
 * Better Auth API errors typically return an object with a 'body' containing the message.
 */
const getBetterAuthErrorMessage = (error: unknown, defaultMessage: string = 'Operation failed'): string => {
  if (error && typeof error === 'object') {
    const err = error as any;

    // Better Auth API errors often have a body with a message property
    if (err.body && typeof err.body === 'object' && err.body.message) {
      return err.body.message;
    }

    // Fallback to standard error message if available
    if (err.message && typeof err.message === 'string') {
      return err.message;
    }

    // Handle string errors
    if (typeof err === 'string') {
      return err;
    }
  }

  return defaultMessage;
};

/**
 * Checks if a Better Auth error is a Forbidden/Unauthorized error.
 */
const isBetterAuthForbidden = (error: unknown): boolean => {
  if (error && typeof error === 'object') {
    const err = error as any;
    const status = err.status || err.statusCode;
    return status === 403 || status === 'FORBIDDEN' || status === 401 || status === 'UNAUTHORIZED';
  }
  return false;
};

/**
 * Safely parses Better Auth metadata, which is often stringified JSON.
 */
const parseBetterAuthMetadata = <T = any>(metadata: any): T | null => {
  if (!metadata) return null;

  if (typeof metadata === 'string') {
    try {
      return JSON.parse(metadata) as T;
    } catch (e) {
      return metadata as unknown as T;
    }
  }

  return metadata as T;
};

const betterAuthUtils = {
  getBetterAuthErrorMessage,
  isBetterAuthForbidden,
  parseBetterAuthMetadata,
}

export default betterAuthUtils;