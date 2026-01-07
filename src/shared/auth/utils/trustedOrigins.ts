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
 * Also validates callbackURLs for OAuth Proxy
 */
export const getTrustedOrigins = (request: Request): string[] => {
  const origin = request.headers.get('origin');
  const origins: string[] = [];

  // Always allow localhost in development (for both Origin header and callbackURL validation)
  const localhostPattern = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

  // Check Origin header
  if (origin && localhostPattern.test(origin)) {
    origins.push(origin);
  }


  if (process.env.BASE_URL) {
    origins.push(process.env.BASE_URL);
  }

  // 3. Add Custom Origins from Environment
  // This reuses the same variable as your CORS middleware
  const envOrigins = process.env.ALLOWED_ORIGINS?.split(',') ?? [];

  envOrigins.forEach(o => {
    const trimmed = o.trim();
    if (trimmed && !origins.includes(trimmed)) {
      origins.push(trimmed);
    }
  });

  return origins;
};

