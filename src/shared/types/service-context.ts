// oxlint-disable typescript/no-unsafe-assignment
import { defineAbilityFor, type AppAbility } from '@/shared/auth/abilities';
import type { DispatchOptions, EventClass } from '@/shared/events/event';
import { getActiveTx } from '@/shared/database/uow';
import type { User } from '@/shared/types/BetterAuth';
import type { Context } from 'hono';

type SystemUser = Pick<User, 'id' | 'email' | 'name'>;

export interface ServiceContext {
  userId: string;
  user: User;
  organizationId: string;
  matterId?: string;
  memberRole: string | null;
  ability: AppAbility;
  requestHeaders: Record<string, string>;
  emit: <T extends Record<string, unknown>>(event: EventClass<T>, payload: T) => Promise<string>;
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

  return createServiceContext(base);
};

/**
 * Creates a system/background ServiceContext for use in listeners or batch jobs.
 */
export const createSystemContext = (organizationId: string, userId = 'system'): ServiceContext =>
  createServiceContext({
    userId,
    user: { id: userId, email: 'system@blawby.com', name: 'System' } as SystemUser as User,
    organizationId,
    memberRole: 'admin',
    ability: defineAbilityFor('admin'),
    requestHeaders: {},
  });

/**
 * Create a ServiceContext given base properties.
 * Event dispatch resolves the active transaction through AsyncLocalStorage.
 */
export const createServiceContext = (base: Omit<ServiceContext, 'emit'>): ServiceContext => {
  const { userId, organizationId } = base as { userId: string; organizationId: string };
  return {
    ...base,
    emit: (event, payload) => {
      const options: DispatchOptions = {
        actorId: userId,
        organizationId,
        tx: getActiveTx(),
      };
      const result = event.dispatch(payload, options);
      return result instanceof Promise ? result : Promise.resolve(result);
    },
  } as ServiceContext;
};
