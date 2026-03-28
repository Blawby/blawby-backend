// Src/shared/middleware/cors.ts
import type { MiddlewareHandler } from 'hono';
import { cors as honoCors } from 'hono/cors';
import { config } from '@/shared/config';

export const cors = (): MiddlewareHandler =>
  honoCors({
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
      const allowedOrigins = config.app.allowedOrigins;

      // Exact match check
      if (allowedOrigins.includes(origin)) {
        return origin;
      }

      // Wildcard check (e.g. *.myapp.com)
      for (const pattern of allowedOrigins) {
        if (pattern.includes('*')) {
          // Escape dots, replace * with .*
          const regex = new RegExp(`^${pattern.replace(/\./g, '\\.').replace(/\*/g, '.*')}$`);
          if (regex.test(origin)) {
            return origin;
          }
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
