import { eq } from 'drizzle-orm';
import { users } from '@/schema/better-auth-schema';
import { linkAnonymousUserData } from '@/shared/auth/services/link-user-data.service';
import { db } from '@/shared/database';
import usersRepository from '@/shared/repositories/users.repository';

/**
 * Resolves a user from intake session or email, handling anonymous linking.
 */
export const resolveUserForIntake = async (params: {
  userId?: string;
  email: string;
  name: string;
  phone?: string;
}): Promise<typeof users.$inferSelect | undefined> => {
  const {
    userId, email, name, phone,
  } = params;
  const existingUserByEmail = await usersRepository.findByEmail(email);

  if (userId) {
    const sessionUser = await usersRepository.findById(userId);
    if (sessionUser) {
      const isAnonymousUser = sessionUser.isAnonymous === true;
      if (isAnonymousUser && existingUserByEmail && existingUserByEmail.id !== userId) {
        await linkAnonymousUserData({
          anonymousUser: { id: userId, email: '' },
          newUser: {
            id: existingUserByEmail.id,
            email: existingUserByEmail.email,
          },
        });
        await db.delete(users).where(eq(users.id, userId));
        return usersRepository.update(existingUserByEmail.id, {
          name,
          phone,
          primaryWorkspace: 'client',
        });
      }
      if (isAnonymousUser) {
        return usersRepository.update(userId, {
          email: email.toLowerCase(),
          name,
          phone,
          isAnonymous: false,
        });
      }
      return usersRepository.update(userId, {
        name: name || sessionUser.name,
        phone: phone || sessionUser.phone || undefined,
      });
    }
  }

  if (existingUserByEmail) {
    return usersRepository.update(existingUserByEmail.id, { name, phone });
  }

  return undefined;
};
