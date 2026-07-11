import { users } from '@/schema/better-auth-schema';
import { db } from '@/shared/database';
import type { Variables } from '@/shared/types/hono';
import { eq } from 'drizzle-orm';
import type { MiddlewareHandler } from 'hono';

export const freshUser = (): MiddlewareHandler<{ Variables: Variables }> => async (c, next) => {
  const userId = c.get('userId');
  const currentUser = c.get('user');

  if (userId) {
    const [row] = await db.select().from(users).where(eq(users.id, userId)).limit(1);

    if (row && currentUser) {
      c.set('user', {
        ...currentUser,
        email: row.email,
        emailVerified: row.emailVerified,
        role: row.role,
      });
    }
  }

  return next();
};
