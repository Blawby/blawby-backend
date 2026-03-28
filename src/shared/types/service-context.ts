// oxlint-disable typescript/no-unsafe-assignment
import type { Context } from 'hono';
import { defineAbilityFor, type AppAbility } from '@/shared/auth/abilities';
import type { DispatchOptions, EventClass } from '@/shared/events/event';
import type { User } from '@/shared/types/BetterAuth';
import type { db } from '@/shared/database';

type SystemUser = Pick<User, 'id' | 'email' | 'name'>;

export interface ServiceContext {
  userId: string;
  user: User;
  organizationId: string;
  matterId?: string;
  memberRole: string | null;
  ability: AppAbility;
  requestHeaders: Record<string, string>;
  emit: <T extends Record<string, unknown>>(event: EventClass<T>, payload: T, tx?: typeof db) => Promise<string>;
}

export const getServiceContext = (c: Context): ServiceContext => {
  const userId = c.get('userId');
  const user = c.get('user');
  const organizationId = c.req.param('organization_id') ?? c.req.param('practice_id') ?? c.get('activeOrganizationId');
  const matterId = c.req.param('id') ?? c.req.param('matter_id');

  return {
    userId,
    user,
    organizationId,
    matterId,
    memberRole: c.get('memberRole'),
    ability: c.get('ability'),
    requestHeaders: c.req.header(),
    emit: (event, payload, tx) => {
      const options: DispatchOptions = {
        actorId: userId,
        organizationId,
        tx,
      };
      const result = event.dispatch(payload, options);
      if (result instanceof Promise) {
        return result;
      }
      return Promise.resolve(result);
    },
  };
};

/**
 * Creates a system/background ServiceContext for use in listeners or batch jobs.
 */
export const createSystemContext = (organizationId: string, userId = 'system'): ServiceContext => ({
  userId,
  user: { id: userId, email: 'system@blawby.com', name: 'System' } as SystemUser as User,
  organizationId,
  memberRole: 'admin',
  ability: defineAbilityFor('admin'),
  requestHeaders: {},
  emit: (event, payload, tx) => {
    const r = event.dispatch(payload, { actorId: userId, organizationId, tx });
    return r instanceof Promise ? r : Promise.resolve(r);
  },
});
