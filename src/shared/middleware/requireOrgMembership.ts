import { getLogger } from '@logtape/logtape';
import { eq, and } from 'drizzle-orm';
import type { MiddlewareHandler } from 'hono';

import { members } from '@/schema';
import { db } from '@/shared/database';
import type { Variables } from '@/shared/types/hono';

const logger = getLogger(['middleware', 'require-org-membership']);

const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;

const authErrorResponder = (
  c: Parameters<MiddlewareHandler<{ Variables: Variables }>>[0],
  status: typeof HTTP_UNAUTHORIZED | typeof HTTP_FORBIDDEN,
  error: 'Unauthorized' | 'Forbidden',
  message: string
) => c.json({ error, message, request_id: c.get('requestId') }, status);

/**
 * Middleware to ensure the authenticated user is a member of the target organization.
 *
 * Uses the session's `activeOrganizationId` set by Better Auth — no URL parsing needed.
 * Resource-level org validation (e.g. intake belongs to this org) is the service layer's job.
 *
 * Must be used AFTER `requireAuth` middleware.
 */
export const requireOrgMembership = (): MiddlewareHandler<{ Variables: Variables }> => async (c, next) => {
  const userId = c.get('userId');

  if (!userId) {
    return authErrorResponder(c, HTTP_UNAUTHORIZED, 'Unauthorized', 'Authentication required');
  }

  const orgId = c.req.param('organization_id') ?? c.req.param('practice_id') ?? c.get('activeOrganizationId');

  if (!orgId) {
    logger.warn('No active organization in session for user {userId}', { userId });
    return authErrorResponder(c, HTTP_FORBIDDEN, 'Forbidden', 'No organization context found');
  }

  try {
    const [membership] = await db
      .select({ role: members.role })
      .from(members)
      .where(and(eq(members.userId, userId), eq(members.organizationId, orgId)))
      .limit(1);

    if (!membership) {
      logger.warn('User {userId} is not a member of organization {orgId}', { userId, orgId });
      return authErrorResponder(c, HTTP_FORBIDDEN, 'Forbidden', 'You are not a member of this organization');
    }

    c.set('memberRole', membership.role);
    c.set('activeOrganizationId', orgId);

    return next();
  } catch (error) {
    logger.error('Failed to check organization membership: {error}', { error, userId, orgId });
    return c.json({ error: 'INTERNAL_SERVER_ERROR', message: 'Failed to verify organization membership' }, 500);
  }
};
