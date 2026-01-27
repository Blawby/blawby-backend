import { eq, and } from 'drizzle-orm';
import { members } from '@/schema/better-auth-schema';
import { createBetterAuthInstance } from '@/shared/auth/better-auth';
import { db } from '@/shared/database';

// Better Auth instance created with the global DB connection
const auth = createBetterAuthInstance(db);

export type InsertMember = typeof members.$inferInsert;
export type SelectMember = typeof members.$inferSelect;


const findByOrgAndUser = async (params: {
  organizationId: string;
  userId: string;
}): Promise<SelectMember | undefined> => {
  const [member] = await db
    .select()
    .from(members)
    .where(
      and(
        eq(members.organizationId, params.organizationId),
        eq(members.userId, params.userId),
      ),
    )
    .limit(1);
  return member;
};

/**
 * Organization role types matching Better Auth configuration
 */
type OrganizationRole = 'owner' | 'admin' | 'member' | 'attorney' | 'paralegal' | 'client';

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


  if (!result) {
    throw new Error('Failed to add member via Better Auth');
  }

  // Better Auth API returns the member object directly or in a wrap depending on context
  // In server-side auth.api, it typically returns the DB record.
  return result as SelectMember;
};

export const membersRepository = {
  findByOrgAndUser,
  create,
};
