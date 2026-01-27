/**
 * Sanitize Auth Response Middleware
 *
 * Removes sensitive token information from auth response bodies
 * while preserving the set-auth-token header for proper bearer token usage
 */

import { getLogger } from '@logtape/logtape';
import type { MiddlewareHandler } from 'hono';

const logger = getLogger(['shared', 'middleware', 'sanitize-auth-response']);

/**
 * Sanitize authentication responses to remove token field from body
 *
 * This middleware:
 * 1. Intercepts auth responses
 * 2. Removes `token` field from JSON response bodies
 * 3. Preserves `set-auth-token` header
 * 4. Only proper bearer token exposed to clients
 */
export const sanitizeAuthResponse = (): MiddlewareHandler => {
  return async (c, next) => {
    await next();

    // Only process JSON responses
    const contentType = c.res.headers.get('content-type');

    if (!contentType?.includes('application/json')) {
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

        // Remove token field if it exists
        if (data && typeof data === 'object' && 'token' in data) {
          delete data.token;

          // Create new response with sanitized data
          const sanitizedBody = JSON.stringify(data);
          const newResponse = new Response(sanitizedBody, {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers,
          });

          // Fix for multiple Set-Cookie headers in Node.js/Fetch
          // @ts-ignore - getSetCookie is available in modern Node.js/Browsers
          if (typeof response.headers.getSetCookie === 'function') {
            const setCookies = response.headers.getSetCookie();
            if (setCookies.length > 0) {
              newResponse.headers.delete('Set-Cookie');
              setCookies.forEach((cookie: string) => {
                newResponse.headers.append('Set-Cookie', cookie);
              });
            }
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
