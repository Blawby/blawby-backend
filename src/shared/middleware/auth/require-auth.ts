import { getLogger } from '@logtape/logtape';
import type { MiddlewareHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
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
export const requireAuth = (): MiddlewareHandler<{ Variables: Variables }> => async (c, next) => {
  try {
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
      const activeOrgId = session.session.activeOrganizationId;

      c.set('activeOrganizationId', activeOrgId ?? null);
    }

    // Block request if no user
    if (!session?.user) {
      throw new HTTPException(401, {
        message: 'Authentication required',
      });
    }

    return next();
  } catch (error) {
    if (error instanceof HTTPException) {
      throw error;
    }

    const logger = getLogger(['app', 'auth']);
    logger.error('Error in requireAuth middleware: {error}', { error });
    throw error;
  }
};
