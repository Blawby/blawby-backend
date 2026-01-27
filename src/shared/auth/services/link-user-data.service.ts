import { getLogger } from '@logtape/logtape';
import { eq, and } from 'drizzle-orm';
import { userDetails } from '@/modules/user-details/database/schema/user-details.schema';
import { members } from '@/schema/better-auth-schema';
import { db } from '@/shared/database';

const logger = getLogger(['auth', 'link-service']);

/**
 * Transfers data from an anonymous user to a new user account.
 * This is called by Better Auth's onLinkAccount hook.
 */
export const linkAnonymousUserData = async (params: {
  anonymousUser: { id: string; email: string };
  newUser: { id: string; email: string };
}): Promise<void> => {
  const { anonymousUser, newUser } = params;

  logger.info('Linking anonymous user {anonId} to new user {newId}', {
    anonId: anonymousUser.id,
    newId: newUser.id,
  });

  await db.transaction(async (tx) => {
    // 1. Move organization memberships
    const anonMemberships = await tx.select().from(members).where(eq(members.userId, anonymousUser.id));

    for (const membership of anonMemberships) {
      // Check if new user already belongs to this organization
      const [existing] = await tx
        .select()
        .from(members)
        .where(
          and(
            eq(members.organizationId, membership.organizationId),
            eq(members.userId, newUser.id),
          ),
        )
        .limit(1);

      if (existing) {
        // New user already in this org, just delete the anonymous membership
        await tx.delete(members).where(eq(members.id, membership.id));
      } else {
        // Move membership to new user
        await tx.update(members).set({ userId: newUser.id }).where(eq(members.id, membership.id));
      }
    }

    // 2. Move User Details (Clients)
    const anonDetails = await tx.select().from(userDetails).where(eq(userDetails.user_id, anonymousUser.id));

    for (const detail of anonDetails) {
      // Check if new user already has details in this organization
      const [existing] = await tx
        .select()
        .from(userDetails)
        .where(
          and(
            eq(userDetails.organization_id, detail.organization_id),
            eq(userDetails.user_id, newUser.id),
          ),
        )
        .limit(1);

      if (existing) {
        // New user already has details, delete the anonymous ones
        await tx.delete(userDetails).where(eq(userDetails.id, detail.id));
      } else {
        // Move details to new user
        await tx.update(userDetails).set({ user_id: newUser.id }).where(eq(userDetails.id, detail.id));
      }
    }
  });

  logger.info('Successfully linked data from anonymous user {anonId} to {newId}', {
    anonId: anonymousUser.id,
    newId: newUser.id,
  });
};

