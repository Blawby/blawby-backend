import type { MiddlewareHandler } from 'hono';
import { cors as honoCors } from 'hono/cors';

/**
 * Check if origin matches a pattern (supports wildcards)
 */
const matchesPattern = function matchesPattern(origin: string, pattern: string): boolean {
  const regexPattern = pattern
    .replace(/\./g, '\\.')
    .replace(/\*/g, '.*');
  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(origin);
};

/**
 * Hono CORS Middleware
 *
 * Supports:
 * - Local development (localhost on any port)
 * - Pattern-based origin matching (e.g., *.example.com)
 * - Explicit origin whitelist
 * - Credentials for cookie-based authentication
 */
export const cors = (): MiddlewareHandler => {
  return honoCors({
    origin: (origin) => {
      // Allow same-origin requests (no origin header)
      if (!origin) return origin;

      // Always allow localhost for local development connecting to deployed backend
      const localhostPattern = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
      if (localhostPattern.test(origin)) {
        return origin;
      }


      // Check allowed origins (comma-separated list with pattern support)
      const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',').map((o) => o.trim()) || [];
      for (const allowedOrigin of allowedOrigins) {
        // Exact match
        if (allowedOrigin === origin) {
          return origin;
        }
        // Pattern match (supports wildcards)
        if (allowedOrigin.includes('*') && matchesPattern(origin, allowedOrigin)) {
          return origin;
        }
      }

      // Reject unknown origins
      return null;
    },
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'Accept',
      'Origin',
      'Cookie',
    ],
    exposeHeaders: ['Set-Cookie', 'Content-Length'],
    credentials: true,
    maxAge: 86400, // 24 hours
  });
};
