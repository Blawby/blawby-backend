/**
 * Sanitize Auth Response Middleware
 *
 * Removes sensitive token information from auth response bodies
 * while preserving the set-auth-token header for proper bearer token usage
 */

import type { MiddlewareHandler } from 'hono';

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

    // Only process JSON responses from auth endpoints
    const path = c.req.path;
    const contentType = c.res.headers.get('content-type');

    if (!path.includes('/api/auth/') || !contentType?.includes('application/json')) {
      return;
    }

    try {
      // Clone the response to avoid modifying the original
      const response = c.res.clone();
      const body = await response.text();

      if (body) {
        const data = JSON.parse(body);

        // Remove token field if it exists
        if (data && typeof data === 'object' && 'token' in data) {
          delete data.token;

          // Create new response with sanitized data
          const sanitizedBody = JSON.stringify(data);
          c.res = new Response(sanitizedBody, {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers,
          });
        }
      }
    } catch (error) {
      // If parsing fails, leave response unchanged
      console.warn('[Auth] Failed to sanitize response:', error);
    }
  };
};
