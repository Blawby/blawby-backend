/**
 * Sanitize Auth Response Middleware
 *
 * Removes sensitive token information from auth response bodies
 * while preserving the set-auth-token header for proper bearer token usage
 * and adds routing computation for get-session responses.
 */

import { getLogger } from '@logtape/logtape';
import type { MiddlewareHandler } from 'hono';
import { computeRoutingClaims } from '@/shared/auth/services/routing.service';

const logger = getLogger(['shared', 'middleware', 'sanitize-auth-response']);

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

        // Remove session.token if it exists
        if (data && typeof data === 'object' && 'session' in data && 
            typeof (data as any).session === 'object' && 'token' in (data as any).session) {
          delete (data as any).session.token;
          madeChanges = true;
        }

        // Add routing claims to get-session responses
        if (data && typeof data === 'object' && 'user' in data && 'session' in data) {
          try {
            const routing = await computeRoutingClaims({
              user: (data as any).user,
              session: (data as any).session,
            });
            (data as any).routing = routing;
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
            newResponse.headers.set(key, value);
          });

          c.res = newResponse;
        }
      }
    } catch (error) {
      // If parsing fails, leave response unchanged
      logger.warn('Failed to sanitize response: {error}', { error });
    }
  };
};
