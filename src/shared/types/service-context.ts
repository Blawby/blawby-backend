// oxlint-disable typescript/no-unsafe-assignment
import type { Context } from 'hono';
import { defineAbilityFor, type AppAbility } from '@/shared/auth/abilities';
import type { DispatchOptions, EventClass } from '@/shared/events/event';
import type { User } from '@/shared/types/BetterAuth';
import { db } from '@/shared/database';

type SystemUser = Pick<User, 'id' | 'email' | 'name'>;

export interface ServiceContext {
  userId: string;
  user: User;
  organizationId: string;
  matterId?: string;
  memberRole: string | null;
  ability: AppAbility;
  requestHeaders: Record<string, string>;
  // Database executor for this context. May be the global `db` or a transaction executor.
  db: typeof db;

  // Emit an event. Optional `tx` may be provided to override ctx.db.
  emit: <T extends Record<string, unknown>>(event: EventClass<T>, payload: T, tx?: typeof db) => Promise<string>;
}

export const getServiceContext = (c: Context): ServiceContext => {
  const userId = c.get('userId');
  const user = c.get('user');
  const organizationId = c.req.param('organization_id') ?? c.req.param('practice_id') ?? c.get('activeOrganizationId');
  const matterId = c.req.param('id') ?? c.req.param('matter_id');
  const base = {
    userId,
    user,
    organizationId,
    matterId,
    memberRole: c.get('memberRole'),
    ability: c.get('ability'),
    requestHeaders: c.req.header(),
  } as const;

  return createServiceContext(base, db);
};

/**
 * Creates a system/background ServiceContext for use in listeners or batch jobs.
 */
export const createSystemContext = (organizationId: string, userId = 'system'): ServiceContext =>
  createServiceContext(
    {
      userId,
      user: { id: userId, email: 'system@blawby.com', name: 'System' } as SystemUser as User,
      organizationId,
      memberRole: 'admin',
      ability: defineAbilityFor('admin'),
      requestHeaders: {},
    },
    db
  );

/**
 * Create a ServiceContext given base properties and an optional DB executor.
 * By default `executor` is the global `db`. Handlers should call `createServiceContext(base, tx)`
 * when they open a transaction.
 */
export const createServiceContext = (
  base: Omit<ServiceContext, 'db' | 'emit'>,
  executor: typeof db = db
): ServiceContext => {
  const { userId, organizationId } = base as { userId: string; organizationId: string };
  return {
    ...base,
    db: executor,
    emit: (event, payload, tx) => {
      const options: DispatchOptions = {
        actorId: userId,
        organizationId,
        tx: tx ?? executor,
      };
      const result = event.dispatch(payload, options);
      return result instanceof Promise ? result : Promise.resolve(result);
    },
  } as ServiceContext;
};
