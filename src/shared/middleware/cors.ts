// Src/shared/middleware/cors.ts
import type { MiddlewareHandler } from 'hono';
import { cors as honoCors } from 'hono/cors';
import { config } from '@/shared/config';

const escapeRegexMetacharacters = (value: string): string => value.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');

export const cors = (): MiddlewareHandler => {
  const { allowedOrigins } = config.app;
  const exactOrigins = allowedOrigins.filter((origin) => !origin.includes('*'));
  const wildcardOriginPatterns = allowedOrigins
    .filter((origin) => origin.includes('*'))
    .map((pattern) => new RegExp(`^${escapeRegexMetacharacters(pattern).replace(/\*/g, '.*')}$`));

  return honoCors({
    origin: (origin) => {
      // 1. Allow non-browser requests (mobile apps, curl, server-to-server)
      if (!origin) {
        return origin;
      }

      // 2. Allow Localhost (Any Port)
      if (
        /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin) ||
        origin === 'https://adapted-humbly-lynx.ngrok-free.app'
      ) {
        return origin;
      }

      // 3. Allow Production Domains from Env
      if (exactOrigins.includes(origin)) {
        return origin;
      }

      for (const wildcardPattern of wildcardOriginPatterns) {
        if (wildcardPattern.test(origin)) {
          return origin;
        }
      }

      // 4. BLOCK: Return specific string or null carefully
      // Hono's cors middleware handles 'undefined' by reflecting origin (bad for security)
      // Or 'string' by setting it.
      // We return the origin if matched, otherwise we return a specific blocked value
      // Or simply don't match (which causes CORS error in browser).
      // Returning `origin` here allows the request, returning `null` blocks it.
      return null;
    },
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'Cookie', 'x-captcha-token', 'x-turnstile-token'], // <--- ADD 'Cookie' and CAPTCHA headers
    exposeHeaders: ['Set-Cookie'], // <--- ADD 'Set-Cookie' for Better Auth
    credentials: true, // <--- CRITICAL for Cookies
    maxAge: 600, // Cache preflight requests for 10 mins
  });
};
