/**
 * Sanitize Auth Response Middleware
 *
 * Removes sensitive token information from auth response bodies
 * while preserving the set-auth-token header for proper bearer token usage
 * and adds routing computation for get-session responses.
 */

import { getLogger } from '@logtape/logtape';
import type { MiddlewareHandler } from 'hono';
import { computeRoutingClaims, type RoutingContext } from '@/shared/auth/services/routing.service';

const logger = getLogger(['shared', 'middleware', 'sanitize-auth-response']);

interface UserPayload {
  id: string;
  isAnonymous: boolean;
  banned?: boolean | null;
  createdAt: string;
  updatedAt: string;
  dob?: string | null;
  banExpires?: string | null;
  [key: string]: unknown;
}

interface SessionPayload {
  id: string;
  userId: string;
  activeOrganizationId?: string | null;
  expiresAt: string;
  token?: string;
  createdAt: string;
  updatedAt: string;
  [key: string]: unknown;
}

interface SessionResponse {
  user: UserPayload;
  session: SessionPayload;
  routing?: unknown;
}

const isSessionResponse = (obj: unknown): obj is SessionResponse => {
  if (!obj || typeof obj !== 'object') return false;
  return (
    'user' in obj
    && obj.user !== null
    && typeof obj.user === 'object'
    && 'session' in obj
    && obj.session !== null
    && typeof obj.session === 'object'
  );
};

/**
 * Validates and parses a date string, returning a Date object or null if invalid/missing.
 */
function parseDateSafe(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    logger.warn('Invalid date string encountered: {value}', { value });
    return null;
  }
  return date;
}

/**
 * Sanitize authentication responses to remove token field from body
 * and add routing computation for get-session responses
 *
 * This middleware:
 * 1. Intercepts auth responses
 * 2. Removes `token` field from JSON response bodies
 * 3. Adds `routing` claims to get-session responses
 * 4. Preserves `set-auth-token` header
 * 5. Only proper bearer token exposed to clients
 */
export const sanitizeAuthResponse = (): MiddlewareHandler => {
  return async (c, next) => {
    await next();

    // Only process JSON responses from exact get-session endpoint
    const contentType = c.res.headers.get('content-type');
    const path = c.req.path;

    // Handle both mounted paths - check both possibilities
    const isGetSession = path === '/api/auth/get-session' || path === '/auth/get-session';

    if (!contentType?.includes('application/json') || !isGetSession) {
      return;
    }

    try {
      // Clone the response to avoid modifying the original
      const response = c.res.clone();
      const body = await response.text();
      const trimmedBody = body.trim();

      if (trimmedBody) {
        let data: unknown;
        try {
          data = JSON.parse(trimmedBody);
        } catch (error) {
          // If parsing fails, skip sanitization
          logger.debug('Failed to parse response body for sanitization: {error}', { error });
          return;
        }

        let madeChanges = false;

        if (isSessionResponse(data)) {
          // Remove session.token if it exists
          if (data.session.token) {
            delete data.session.token;
            madeChanges = true;
          }

          // Add routing claims to get-session responses
          try {
            // Construct routing context with proper Date objects
            const user = data.user;
            const session = data.session;

            const userCreatedAt = parseDateSafe(user.createdAt);
            const userUpdatedAt = parseDateSafe(user.updatedAt);
            const sessionExpiresAt = parseDateSafe(session.expiresAt);
            const sessionCreatedAt = parseDateSafe(session.createdAt);
            const sessionUpdatedAt = parseDateSafe(session.updatedAt);

            if (!userCreatedAt || !userUpdatedAt || !sessionExpiresAt || !sessionCreatedAt || !sessionUpdatedAt) {
              throw new Error('Missing or invalid required dates in session response');
            }

            const routing = await computeRoutingClaims({
              user: {
                ...user,
                createdAt: userCreatedAt,
                updatedAt: userUpdatedAt,
                dob: parseDateSafe(user.dob),
                banExpires: parseDateSafe(user.banExpires),
              } as unknown as RoutingContext['user'],
              session: {
                ...session,
                expiresAt: sessionExpiresAt,
                createdAt: sessionCreatedAt,
                updatedAt: sessionUpdatedAt,
              } as unknown as RoutingContext['session'],
            });
            data.routing = routing;
            madeChanges = true;
          } catch (error) {
            logger.error('Failed to compute routing claims: {error}', { error });
            // Continue without routing rather than failing the request
          }
        }

        // Only create new response if we made changes
        if (madeChanges) {
          const modifiedBody = JSON.stringify(data);
          const newResponse = new Response(modifiedBody, {
            status: response.status,
            statusText: response.statusText,
          });

          // Copy headers but remove ones that become invalid when body changes
          const headers = new Headers(response.headers);
          headers.delete('content-length');
          headers.delete('content-encoding');
          
          // Note: Keep set-auth-token header for bearer token flows (CLI, mobile, server-to-server)

          // Fix for multiple Set-Cookie headers in Node.js/Fetch
          // @ts-ignore - getSetCookie is available in modern Node.js/Browsers
          if (typeof response.headers.getSetCookie === 'function') {
            const setCookies = response.headers.getSetCookie();
            if (setCookies.length > 0) {
              headers.delete('Set-Cookie');
              setCookies.forEach((cookie: string) => {
                headers.append('Set-Cookie', cookie);
              });
            }
          }

          // Ensure content-type is set for JSON response
          if (!headers.has('content-type')) {
            headers.set('content-type', 'application/json');
          }

          // Apply cleaned headers to new response
          headers.forEach((value, key) => {
            const isCookie = key.toLowerCase() === 'set-cookie';
            // @ts-ignore - getSetCookie is available in modern environments
            const hasGetSetCookie = typeof headers.getSetCookie === 'function';

            if (!isCookie) {
              // Use set() for standard headers to avoid duplicates
              newResponse.headers.set(key, value);
            } else if (!hasGetSetCookie) {
              // Fallback for older runtimes: append the (possibly combined) cookie string
              newResponse.headers.append(key, value);
            }
          });

          // Re-apply Set-Cookie specifically to ensure separate headers
          // @ts-ignore - getSetCookie is available in modern environments
          if (typeof headers.getSetCookie === 'function') {
            const finalCookies = headers.getSetCookie();
            finalCookies.forEach((cookie: string) => {
              newResponse.headers.append('Set-Cookie', cookie);
            });
          }

          c.res = newResponse;
        }
      }
    } catch (error) {
      // If parsing fails, leave response unchanged
      logger.warn('Failed to sanitize response: {error}', { error });
    }
  };
};
