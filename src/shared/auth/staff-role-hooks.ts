import { getLogger } from '@logtape/logtape';
import { APIError, createAuthMiddleware, getSessionFromCtx } from 'better-auth/api';
import { eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

// Schema is used as namespace for the typed Drizzle database.
// oxlint-disable-next-line no-namespace
import * as schema from '@/schema';
import { checkStaffRoleGrant } from '@/shared/auth/staff-role-guard';
import { config } from '@/shared/config';

type StaffRoleCheckUser = { role?: string | null; email: string; emailVerified: boolean };

const logger = getLogger(['shared', 'auth', 'staff-roles']);

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const getSetRoleUserId = (body: unknown): string | undefined => {
  if (!isRecord(body)) {
    return undefined;
  }

  return typeof body.userId === 'string' ? body.userId : undefined;
};

const getSetRoleRequestedRoles = (body: unknown): string[] => {
  if (!isRecord(body)) {
    return [];
  }

  if (typeof body.role === 'string') {
    return [body.role];
  }

  if (Array.isArray(body.role)) {
    return body.role.filter((role): role is string => typeof role === 'string');
  }

  return [];
};

const findStaffRoleCheckUser = async (
  db: NodePgDatabase<typeof schema>,
  userId: string | undefined
): Promise<StaffRoleCheckUser | null> => {
  if (!userId) {
    return null;
  }

  const [user] = await db
    .select({
      role: schema.users.role,
      email: schema.users.email,
      emailVerified: schema.users.emailVerified,
    })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);

  return user ?? null;
};

const createStaffRoleHooks = (db: NodePgDatabase<typeof schema>) => ({
  before: createAuthMiddleware(async (ctx) => {
    if (ctx.path !== '/admin/set-role') {
      return;
    }

    const userId = getSetRoleUserId(ctx.body);
    const requestedRoles = getSetRoleRequestedRoles(ctx.body);
    const session = await getSessionFromCtx(ctx);
    const caller = await findStaffRoleCheckUser(db, session?.user.id);
    const target = await findStaffRoleCheckUser(db, userId);

    const result = checkStaffRoleGrant({
      requestedRoles,
      caller,
      target,
      staffDomain: config.auth.staffEmailDomain,
    });

    if (!result.allowed) {
      logger.warn('Blocked staff role change via set-role: {reason}', {
        reason: result.reason,
        targetUserId: userId,
        callerUserId: session?.user.id,
        requestedRoles,
      });
      throw new APIError('FORBIDDEN', { message: result.reason });
    }

    if (requestedRoles.length > 0) {
      logger.info('Staff-relevant set-role permitted', {
        targetUserId: userId,
        callerUserId: session?.user.id,
        requestedRoles,
      });
    }
  }),
  after: createAuthMiddleware(async (ctx) => {
    if (ctx.path !== '/admin/set-role') {
      return;
    }

    const userId = getSetRoleUserId(ctx.body);

    if (userId) {
      await ctx.context.internalAdapter.deleteSessions(userId);
    }
  }),
});

export { createStaffRoleHooks };
