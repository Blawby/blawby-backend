import { eq, and } from 'drizzle-orm';
import { members } from '@/schema/better-auth-schema';
import { createBetterAuthInstance } from '@/shared/auth/better-auth';
import { db } from '@/shared/database';
import usersRepository from '@/shared/repositories/users.repository';

// Better Auth instance created with the global DB connection
const auth = createBetterAuthInstance(db);

const findByOrgAndUser = async (params: {
  organizationId: string;
  userId: string;
}): Promise<SelectMember | undefined> => {
  const [member] = await db
    .select()
    .from(members)
    .where(and(eq(members.organizationId, params.organizationId), eq(members.userId, params.userId)))
    .limit(1);
  return member;
};

/**
 * Organization role types matching Better Auth configuration
 */
type OrganizationRole = 'owner' | 'admin' | 'member' | 'attorney' | 'paralegal' | 'client';

/**
 * Type guard to validate member record shape from Better Auth API
 */
const isMemberRecord = (value: unknown): value is SelectMember =>
  typeof value === 'object' && value !== null && 'id' in value && 'organizationId' in value && 'userId' in value;

/**
 * Programmatically add a member to an organization using the Better Auth API
 * This ensures roles and permissions are correctly handled.
 */
const create = async (data: {
  organizationId: string;
  userId: string;
  role: OrganizationRole;
}): Promise<SelectMember> => {
  const result = await auth.api.addMember({
    headers: new Headers(),
    body: {
      organizationId: data.organizationId,
      userId: data.userId,
      role: data.role,
    },
  });

  if (!result || !isMemberRecord(result)) {
    throw new Error('Unexpected addMember response shape');
  }

  // Enforce primaryWorkspace if the user doesn't have one yet (best-effort, non-fatal)
  try {
    const user = await usersRepository.findById(data.userId);
    if (user && !user.primaryWorkspace) {
      await usersRepository.update(user.id, { primaryWorkspace: 'practice' });
    }
  } catch {
    // Do not fail member creation after it has already succeeded
  }

  return result;
};

export const membersRepository = {
  findByOrgAndUser,
  create,
};

export type InsertMember = typeof members.$inferInsert;
export type SelectMember = typeof members.$inferSelect;
