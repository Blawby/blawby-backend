/**
 * Sanitize Auth Response Middleware
 *
 * Removes sensitive token information from auth response bodies
 * while preserving the set-auth-token header for proper bearer token usage.
 */

import { getLogger } from '@logtape/logtape';
import type { MiddlewareHandler } from 'hono';

const logger = getLogger(['shared', 'middleware', 'sanitize-auth-response']);

interface SessionResponse {
  user: {
    id: string;
    isAnonymous: boolean;
    banned?: boolean | null;
    [key: string]: unknown;
  };
  session: {
    id: string;
    userId: string;
    activeOrganizationId?: string | null;
    token?: string;
    [key: string]: unknown;
  };
}

const isSessionResponse = (obj: unknown): obj is SessionResponse => {
  if (!obj || typeof obj !== 'object') {
    return false;
  }
  if (!('user' in obj) || !('session' in obj)) {
    return false;
  }

  const { user, session } = obj as Record<string, unknown>;
  if (!user || typeof user !== 'object') {
    return false;
  }
  if (!session || typeof session !== 'object') {
    return false;
  }

  // Validate required fields
  const u = user as Record<string, unknown>;
  const s = session as Record<string, unknown>;
  return (
    typeof u.id === 'string' &&
    typeof u.isAnonymous === 'boolean' &&
    typeof s.id === 'string' &&
    typeof s.userId === 'string'
  );
};

/**
 * Build a new Response with properly handled headers (including multi-value Set-Cookie).
 */
const buildResponse = (body: string, original: Response): Response => {
  const headers = new Headers(original.headers);
  headers.delete('content-length');
  headers.delete('content-encoding');

  // Preserve individual Set-Cookie headers which Headers.forEach() would concatenate
  // @ts-ignore - getSetCookie is available in modern Node.js/Browsers
  const setCookies: string[] =
    typeof original.headers.getSetCookie === 'function' ? original.headers.getSetCookie() : [];

  const newResponse = new Response(body, {
    status: original.status,
    statusText: original.statusText,
    headers,
  });

  // Re-apply Set-Cookie as individual headers (the Headers constructor may merge them)
  if (setCookies.length > 0) {
    newResponse.headers.delete('Set-Cookie');
    for (const cookie of setCookies) {
      newResponse.headers.append('Set-Cookie', cookie);
    }
  }

  return newResponse;
};

/**
 * Sanitize authentication responses to remove token field from body
 * while keeping response payloads consistent.
 *
 * This middleware:
 * 1. Intercepts all auth JSON responses
 * 2. Removes `token` field from JSON response bodies (all endpoints)
 * 3. Preserves `set-auth-token` header
 */
export const sanitizeAuthResponse = (): MiddlewareHandler => async (c, next) => {
  await next();

  // Only process JSON responses
  const contentType = c.res.headers.get('content-type');
  if (!contentType?.includes('application/json')) {
    return;
  }

  try {
    const response = c.res.clone();
    const body = await response.text();
    const trimmedBody = body.trim();

    if (!trimmedBody) {
      return;
    }

    let data: Record<string, unknown>;
    try {
      data = JSON.parse(trimmedBody);
    } catch {
      return;
    }

    if (!data || typeof data !== 'object') {
      return;
    }

    let madeChanges = false;

    // Strip top-level `token` from ALL auth responses (security: don't leak session tokens)
    if ('token' in data) {
      delete data.token;
      madeChanges = true;
    }

    // For session responses, also strip nested session.token
    if (isSessionResponse(data) && data.session.token) {
      delete data.session.token;
      madeChanges = true;
    }

    if (madeChanges) {
      c.res = buildResponse(JSON.stringify(data), response);
    }
  } catch (error) {
    logger.warn('Failed to sanitize response: {error}', { error });
  }
};
