/**
 * Trusted Origins Utility
 *
 * Handles origin validation for Better Auth CORS configuration
 */

/**
 * Check if origin matches a pattern (supports wildcards)
 */
export const matchesPattern = (origin: string, pattern: string): boolean => {
  const regexPattern = pattern
    .replace(/\./g, '\\.')
    .replace(/\*/g, '.*');
  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(origin);
};

/**
 * Get trusted origins for Better Auth
 */
export const getTrustedOrigins = (request: Request): string[] => {
  const origin = request.headers.get('origin');

  // If no Origin header, return empty array (origin check is disabled in development via disableOriginCheck)
  if (!origin) {
    return [];
  }

  // Allow localhost in development
  const localhostPattern = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
  if (localhostPattern.test(origin)) {
    return [origin];
  }

  // Check allowed origins from environment
  const allowed = process.env.ALLOWED_ORIGINS?.split(',').map((o) => o.trim()) || [];
  for (const allowedOrigin of allowed) {
    if (allowedOrigin === origin) return [origin];
    if (allowedOrigin.includes('*') && matchesPattern(origin, allowedOrigin)) {
      return [origin];
    }
  }

  return [];
};

