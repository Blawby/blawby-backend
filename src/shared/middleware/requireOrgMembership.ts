import { getLogger } from '@logtape/logtape';
import { eq, and } from 'drizzle-orm';
import type { MiddlewareHandler } from 'hono';

import { members } from '@/schema';
import { db } from '@/shared/database';
import type { Variables } from '@/shared/types/hono';
import { response } from '@/shared/utils/responseUtils';

const logger = getLogger(['middleware', 'require-org-membership']);

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Extracts the org/practice UUID from the URL path.
 *
 * Named URL params (e.g. `practice_id`) are NOT available in parent-app middleware
 * because Hono only resolves route params for the matched sub-app route, which runs
 * after the parent middleware chain. Parsing the raw path is the reliable approach.
 *
 * URL structure: /api/{module}/{practice_id}/...
 * The practice_id is always the 3rd path segment (index 2).
 */
const extractOrgIdFromPath = (path: string): string | undefined => {
  const segments = path.split('/').filter(Boolean);
  const [candidate] = segments.slice(2);
  return candidate && UUID_REGEX.test(candidate) ? candidate : undefined;
};

/**
 * Middleware to ensure the authenticated user is a member of the target organization.
 *
 * Resolves the org ID from the URL path first (reliable in parent middleware context),
 * then falls back to the session's `activeOrganizationId`.
 *
 * Must be used AFTER `requireAuth` middleware.
 *
 * Returns 403 if:
 *  - No organization context is found at all
 *  - The user is not a member of the target organization
 */
export const requireOrgMembership = (): MiddlewareHandler<{ Variables: Variables }> => async (c, next) => {
  const userId = c.get('userId');

  if (!userId) {
    // oxlint-disable-next-line no-unsafe-return
    return response.unauthorized(c, 'Authentication required');
  }

  // Named params (c.req.param) are NOT reliable in parent middleware — parse the URL path directly.
  const orgId = extractOrgIdFromPath(c.req.path) ?? c.get('activeOrganizationId');

  if (!orgId) {
    logger.warn('No organization context found for user {userId}', { userId });
    // oxlint-disable-next-line no-unsafe-return
    return response.forbidden(c, 'No organization context found');
  }

  try {
    const [membership] = await db
      .select({ role: members.role })
      .from(members)
      .where(and(eq(members.userId, userId), eq(members.organizationId, orgId)))
      .limit(1);

    if (!membership) {
      logger.warn('User {userId} attempted to access organization {orgId} without membership', { userId, orgId });
      // oxlint-disable-next-line no-unsafe-return
      return response.forbidden(c, 'You are not a member of this organization');
    }

    // 🚨 CRITICAL: Propagate context to the Hono context
    // This ensures downstream injectAbility and Services use the CORRECT targeted organization
    c.set('activeOrganizationId', orgId);
    c.set('memberRole', membership.role);

    return next();
  } catch (error) {
    logger.error('Failed to check organization membership: {error}', { error, userId, orgId });
    return c.json({ error: 'INTERNAL_SERVER_ERROR', message: 'Failed to verify organization membership' }, 500);
  }
};
