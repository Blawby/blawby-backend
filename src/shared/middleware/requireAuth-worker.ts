import type { MiddlewareHandler } from 'hono';
import { validateSessionWithAuthWorker } from '@/shared/auth/auth-worker-client';
import type { Variables } from '@/shared/types/hono';

/**
 * Authentication Middleware using Auth Worker
 *
 * This middleware validates sessions via the separate Cloudflare Auth Worker.
 * Use this for microservices architecture where auth is in a separate service.
 */
export const requireAuthWorker = (): MiddlewareHandler<{ Variables: Variables }> => {
  return async (c, next) => {
    try {
      const cookieHeader = c.req.header('cookie');
      const authHeader = c.req.header('Authorization');
      const authToken = authHeader?.startsWith('Bearer ')
        ? authHeader.substring(7)
        : undefined;

      const sessionData = await validateSessionWithAuthWorker(cookieHeader, authToken);

      if (!sessionData) {
        return c.json({
          error: 'Unauthorized',
          message: 'Authentication required',
        }, 401);
      }

      // Set context
      c.set('user', sessionData.user);
      c.set('session', sessionData.session);
      c.set('userId', sessionData.user.id);
      c.set('activeOrganizationId', sessionData.session.activeOrganizationId ?? null);

      return next();
    } catch (error) {
      console.error('Error in requireAuthWorker middleware:', error);
      return c.json({
        error: 'Unauthorized',
        message: 'Authentication required',
      }, 401);
    }
  };
};

