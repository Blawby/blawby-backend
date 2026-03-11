import type { Context } from 'hono';
import type { AppAbility } from '../auth/abilities';
import { db } from '../database';
import type { DispatchOptions, EventClass } from '../events/event';
import type { User } from './BetterAuth';

export type ServiceContext = {
  userId: string;
  user: User;
  organizationId: string;
  matterId?: string;
  memberRole: string | null;
  ability: AppAbility;
  requestHeaders: Record<string, string>;
  emit: <T extends Record<string, unknown>>(
    event: EventClass<T>,
    payload: T,
    tx?: typeof db,
  ) => Promise<string>;
};

export const getServiceContext = (c: Context): ServiceContext => {
  const userId = c.get('userId');
  const user = c.get('user');
  const organizationId = c.req.param('organization_id')
    || c.req.param('practice_id')
    || c.get('activeOrganizationId');
  const matterId = c.req.param('id') || c.req.param('matter_id');

  return {
    userId,
    user,
    organizationId,
    matterId,
    memberRole: c.get('memberRole'),
    ability: c.get('ability'),
    requestHeaders: c.req.header(),
    emit: (event, payload, tx) => {
      // Create options object
      const options: DispatchOptions = {
        actorId: userId,
        organizationId,
        tx,
      };

      // Dispatch event
      const result = event.dispatch(payload, options);

      // Handle return type (Promise or string)
      if (result instanceof Promise) {
        return result;
      }
      return Promise.resolve(result);
    },
  };
};
