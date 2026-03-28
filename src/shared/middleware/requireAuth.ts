import { getLogger } from '@logtape/logtape';
import { and, eq } from 'drizzle-orm';
import type { MiddlewareHandler } from 'hono';
import { ADMIN_ROLES } from '@/shared/enums/org-roles';
import { members } from '@/schema/better-auth-schema';
import { createBetterAuthInstance } from '@/shared/auth/better-auth';
import { db } from '@/shared/database';
import type { Variables } from '@/shared/types/hono';
import { sendError } from '@/shared/utils/responseUtils';

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
      const { primaryWorkspace } = session.user;

      c.set('activeOrganizationId', activeOrgId ?? primaryWorkspace ?? null);
    }

    // Block request if no user
    if (!session?.user) {
      return sendError(c, { code: 'UNAUTHORIZED', message: 'Authentication required', status: 401 });
    }

    return next();
  } catch (error) {
    // Log the error and block the request
    const logger = getLogger(['app', 'auth']);
    logger.error('Error in requireAuth middleware: {error}', { error });
    return sendError(c, { code: 'UNAUTHORIZED', message: 'Authentication required', status: 401 });
  }
};

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

/**
 * Admin Middleware - Requires admin role
 *
 * Use this for admin-only routes
 */
export const requireAdmin = (): MiddlewareHandler<{ Variables: Variables }> => async (c, next) => {
  const user = c.get('user');
  const userId = c.get('userId');
  const organizationId = c.get('activeOrganizationId');

  if (!user) {
    return c.json({ error: 'Unauthorized', message: 'Authentication required' }, 401);
  }

  if (!userId || !organizationId) {
    return c.json({ error: 'Forbidden', message: 'Organization context required' }, 403);
  }

  const [membership] = await db
    .select({ role: members.role })
    .from(members)
    .where(and(eq(members.userId, userId), eq(members.organizationId, organizationId)))
    .limit(1);

  if (!membership) {
    return c.json({ error: 'Forbidden', message: 'You are not a member of this organization' }, 403);
  }

  if (!(ADMIN_ROLES as readonly string[]).includes(membership.role)) {
    return c.json({ error: 'Forbidden', message: 'Admin access required' }, 403);
  }

  return next();
};
