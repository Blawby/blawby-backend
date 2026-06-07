import { getLogger } from '@logtape/logtape';
import { eq } from 'drizzle-orm';
import { users } from '@/schema/better-auth-schema';
import { getActiveTx } from '@/shared/database/uow';

const logger = getLogger(['app', 'repositories', 'users']);

export type InsertUser = typeof users.$inferInsert;
export type SelectUser = typeof users.$inferSelect;

/**
 * Users repository for read operations and updates.
 *
 * For user creation:
 * - Anonymous users are created via Better Auth's anonymous sign-in
 * - Regular users sign up via Better Auth's email/OAuth flows
 * - Staff can invite users via Better Auth's organization invite flow
 *
 * This repository does NOT create users directly - all user creation
 * should go through Better Auth to maintain proper authentication state.
 */

const findById = async (id: string): Promise<SelectUser | undefined> => {
  const [user] = await getActiveTx().select().from(users).where(eq(users.id, id)).limit(1);
  return user ?? undefined;
};

const findByEmail = async (email: string): Promise<SelectUser | undefined> => {
  const [user] = await getActiveTx().select().from(users).where(eq(users.email, email.toLowerCase())).limit(1);
  return user ?? undefined;
};

/**
 * Update a user using Better Auth's Admin API.
 * This ensures proper hook execution and internal state management.
 */
const update = async (
  id: string,
  data: Partial<{
    name: string;
    email: string;
    phone: string;
    primaryWorkspace: string;
    isAnonymous: boolean;
  }>
): Promise<SelectUser | undefined> => {
  // Prepare update data for Better Auth API
  const updateFields: Record<string, unknown> = {};

  if (data.name !== undefined) {
    updateFields.name = data.name;
  }
  if (data.email !== undefined) {
    updateFields.email = data.email.toLowerCase();
  }
  if (data.phone !== undefined) {
    updateFields.phone = data.phone;
  }
  if (data.primaryWorkspace !== undefined) {
    updateFields.primaryWorkspace = data.primaryWorkspace;
  }
  if (data.isAnonymous !== undefined) {
    updateFields.isAnonymous = data.isAnonymous;
  }

  if (Object.keys(updateFields).length > 0) {
    try {
      await getActiveTx().update(users).set(updateFields).where(eq(users.id, id));
    } catch (error) {
      logger.error('Failed to update user {userId} in database', { userId: id, error });
      throw error;
    }
  }

  // Return fresh user from DB (may be undefined if user was not found)
  return await findById(id);
};

const usersRepository = {
  findById,
  findByEmail,
  update,
};

export default usersRepository;
