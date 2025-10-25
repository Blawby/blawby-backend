import type { MiddlewareHandler } from 'hono';
import { createBetterAuthInstance } from '@/shared/auth/better-auth';
import { db } from '@/shared/database';
import type { Variables } from '@/shared/types/hono';

/**
 * Authentication Middleware - Sets user context and blocks unauthenticated users
 *
 * This middleware:
 * 1. Extracts session from Better Auth
 * 2. Sets user data in context
 * 3. Blocks requests if user is not authenticated
 */
export const requireAuth = (): MiddlewareHandler<{ Variables: Variables }> => {
  return async (c, next) => {
    try {
      // 🆕 STEP 1: Validate bearer token format
      const authHeader = c.req.header('Authorization');

      if (authHeader?.startsWith('Bearer ')) {
        const token = authHeader.substring(7);

        // Validate token format - reject simple session tokens
        const isValidBearerToken = validateBearerTokenFormat(token);

        if (!isValidBearerToken) {
          console.warn('[Auth] Rejected token: Invalid bearer token format', {
            tokenLength: token.length,
            tokenStart: token.substring(0, 10) + '...',
            endpoint: c.req.path,
          });

          return c.json({
            error: 'Unauthorized',
            message: 'Invalid bearer token format. Please use the token from set-auth-token header.',
          }, 401);
        }
      }

      // STEP 2: Existing session validation
      const authInstance = createBetterAuthInstance(db);

      // Get session from Better Auth
      const session = await authInstance.api.getSession({
        headers: c.req.raw.headers,
      });

      // Set session and user in context
      if (session?.user) {
        c.set('session', session);
        c.set('user', session.user);
        c.set('userId', session.user.id);
        c.set('activeOrganizationId', session.session.activeOrganizationId ?? null);
      }

      // Block request if no user
      if (!session?.user) {
        return c.json({
          error: 'Unauthorized',
          message: 'Authentication required',
        }, 401);
      }

      return next();
    } catch (error) {
      // Log the error and block the request
      console.error('Error in requireAuth middleware:', error);
      return c.json({
        error: 'Unauthorized',
        message: 'Authentication required',
      }, 401);
    }
  };
};

/**
 * Guest Middleware - Redirects authenticated users
 *
 * Use this for routes that should only be accessible to non-authenticated users
 * (like login, register pages)
 */
export const requireGuest = (): MiddlewareHandler<{ Variables: Variables }> => {
  return async (c, next) => {
    const user = c.get('user');

    if (user) {
      // User is already authenticated, return error
      return c.json({ error: 'Bad Request', message: 'Already authenticated' }, 400);
    }

    return next();
  };
};

/**
 * Admin Middleware - Requires admin role
 *
 * Use this for admin-only routes
 */
export const requireAdmin = (): MiddlewareHandler<{ Variables: Variables }> => {
  return async (c, next) => {
    const user = c.get('user');

    if (!user) {
      return c.json({ error: 'Unauthorized', message: 'Authentication required' }, 401);
    }

    // TODO: Check if user has admin role
    // For now, we'll assume all authenticated users are admins
    // You can implement role checking here

    return next();
  };
};

/**
 * Rate Limiting Middleware
 *
 * Simple rate limiting implementation
 */
export const throttle = (requestsPerMinute: number = 60): MiddlewareHandler => {
  const requests = new Map<string, number[]>();

  return async (c, next) => {
    const clientId = c.req.header('x-forwarded-for')
      || c.req.header('x-real-ip')
      || 'unknown';

    const now = Date.now();
    const minuteAgo = now - 60000;

    // Clean old requests
    const clientRequests = requests.get(clientId) || [];
    const recentRequests = clientRequests.filter((time) => time > minuteAgo);

    if (recentRequests.length >= requestsPerMinute) {
      return c.json({ error: 'Too Many Requests', message: 'Rate limit exceeded' }, 429);
    }

    // Add current request
    recentRequests.push(now);
    requests.set(clientId, recentRequests);

    return next();
  };
};

/**
 * Validate bearer token format
 *
 * Bearer tokens from set-auth-token header are typically:
 * - Longer (usually 100+ characters)
 * - Contain special characters (dots, dashes, underscores)
 * - May be JWT format (xxx.yyy.zzz)
 *
 * Session tokens from database are typically:
 * - Shorter (32-40 characters)
 * - Simple alphanumeric only
 * - No special characters
 */
function validateBearerTokenFormat(token: string): boolean {
  // Check 1: Minimum length (bearer tokens are typically longer)
  if (token.length < 40) {
    return false;
  }

  // Check 2: Must contain at least one special character
  // Bearer tokens typically have dots (JWTs), dashes, or underscores
  const hasSpecialChar = /[^a-zA-Z0-9]/.test(token);

  if (!hasSpecialChar) {
    return false;
  }

  // Check 3: JWT format check (optional but recommended)
  // JWTs have format: header.payload.signature
  const isJWT = /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/.test(token);

  // If it's a JWT, it's definitely valid
  if (isJWT) {
    return true;
  }

  // For non-JWT bearer tokens, basic checks passed
  return true;
}
