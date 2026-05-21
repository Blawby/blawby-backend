import { getLogger } from '@logtape/logtape';
import { and, eq } from 'drizzle-orm';
import type { MiddlewareHandler } from 'hono';

import { members } from '@/schema/better-auth-schema';
import { defineAbilityFor } from '@/shared/auth/abilities';
import { db } from '@/shared/database';
import type { Variables } from '@/shared/types/hono';

const logger = getLogger(['middleware', 'inject-ability']);

/**
 * Middleware to inject CASL Ability into Hono context.
 *
 * Must be run AFTER requireAuth middleware.
 */
export const injectAbility = (): MiddlewareHandler<{ Variables: Variables }> => async (c, next) => {
  const userId = c.get('userId');
  const orgId = c.get('activeOrganizationId');

  if (!userId) {
    // Should not happen if requireAuth is used, but for safety:
    c.set('ability', defineAbilityFor(null));
    return next();
  }

  try {
    let role: string | null = null;

    // If we have an orgId, fetch the member role
    if (orgId) {
      const memberResult = await db
        .select({ role: members.role })
        .from(members)
        .where(and(eq(members.userId, userId), eq(members.organizationId, orgId)))
        .limit(1);

      if (memberResult[0]) {
        ({ role } = memberResult[0]);
      }
    }

    // Store role in context for later use (ServiceContext)
    c.set('memberRole', role);

    // Inject Ability
    const ability = defineAbilityFor(role, { userId, organizationId: orgId ?? undefined });
    c.set('ability', ability);

    return next();
  } catch (error) {
    logger.error('Failed to inject ability: {error}', { error, userId, orgId });
    // Fallback to empty ability
    c.set('ability', defineAbilityFor(null));
    return next();
  }
};
