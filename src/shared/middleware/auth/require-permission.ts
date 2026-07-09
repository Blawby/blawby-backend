import type { MiddlewareHandler } from 'hono';
import type { Action, SubjectName } from '@/shared/auth/abilities';
import type { Variables } from '@/shared/types/hono';

export const requirePermission =
  (action: Action, subject: SubjectName): MiddlewareHandler<{ Variables: Variables }> =>
  async (c, next) => {
    const ability = c.get('ability');

    if (!ability.can(action, subject)) {
      return c.json({ error: 'Forbidden', message: 'Permission denied' }, 403);
    }

    return next();
  };
