import { and, eq } from 'drizzle-orm';
import type { MiddlewareHandler } from 'hono';
import { ADMIN_ROLES } from '@/shared/enums/org-roles';
import { members } from '@/schema/better-auth-schema';
import { db } from '@/shared/database';
import type { Variables } from '@/shared/types/hono';

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
