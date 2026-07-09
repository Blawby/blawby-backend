import type { MiddlewareHandler } from 'hono';
import type { Variables } from '@/shared/types/hono';

/**
 * Guest Middleware - Redirects authenticated users
 *
 * Use this for routes that should only be accessible to non-authenticated users
 * (like login, register pages)
 */
export const requireGuest = (): MiddlewareHandler<{ Variables: Variables }> => async (c, next) => {
  const user = c.get('user');

  if (user) {
    // User is already authenticated, return error
    return c.json({ error: 'Bad Request', message: 'Already authenticated' }, 400);
  }

  return next();
};
