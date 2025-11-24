import type { MiddlewareHandler } from 'hono';
import { cors as honoCors } from 'hono/cors';

/**
 * Check if origin matches a pattern (supports wildcards)
 */
const matchesPattern = (origin: string, pattern: string): boolean => {
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
 * - Local development (localhost or 127.0.0.1 any port)
 * - Pattern-based origin matching (wildcards)
 * - Explicit origin whitelist via env
 * - Bearer token authentication
 */
export const cors = (): MiddlewareHandler => {
  return honoCors({
    origin: (origin) => {
      if (!origin) {
        // same-origin or no origin header => allow
        return origin;
      }

      // Allow localhost / 127.0.0.1 on any port
      const localhostPattern = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
      if (localhostPattern.test(origin)) {
        return origin;
      }

      // Use explicit whitelist from env
      const allowedOrigins = (process.env.ALLOWED_ORIGINS?.split(',') ?? []).map((o) => o.trim());
      for (const allowed of allowedOrigins) {
        if (allowed === origin) {
          return origin;
        }
        if (allowed.includes('*') && matchesPattern(origin, allowed)) {
          return origin;
        }
      }

      // Unknown origin – reject
      return null;
    },
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'Accept',
      'Origin',
    ],
    exposeHeaders: ['Content-Length', 'Set-Auth-Token'],
    credentials: true,
  });
};
