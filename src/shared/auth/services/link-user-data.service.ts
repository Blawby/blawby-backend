import { getLogger, type Logger } from '@logtape/logtape';
import { eq, and } from 'drizzle-orm';
import { practiceClientIntakes } from '@/modules/practice-client-intakes/database/schema/practice-client-intakes.schema';
import { userDetails } from '@/modules/user-details/database/schema/user-details.schema';
import { members, users } from '@/schema/better-auth-schema';
import { db } from '@/shared/database';
import { PracticeMemberJoined } from '@/shared/events/definitions';

const logger: Logger = getLogger(['auth', 'link-service']);

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
    const anonMemberships: Array<typeof members.$inferSelect> = await tx
      .select()
      .from(members)
      .where(eq(members.userId, anonymousUser.id));

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
    const anonDetails: Array<typeof userDetails.$inferSelect> = await tx
      .select()
      .from(userDetails)
      .where(eq(userDetails.user_id, anonymousUser.id));

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

    // 3. Check for succeeded intakes and add user to organization as client
    const succeededIntakes = await tx
      .select()
      .from(practiceClientIntakes)
      .where(
        and(
          eq(practiceClientIntakes.status, 'succeeded'),
          // Match by user_id in metadata (JSON field)
        ),
      );

    // Filter intakes that belong to the anonymous user
    const userIntakes = succeededIntakes.filter((intake) => {
      const metadata = intake.metadata as { user_id?: string } | null;
      return metadata?.user_id === anonymousUser.id;
    });

    for (const intake of userIntakes) {
      // Check if new user already belongs to this organization
      const [existingMember] = await tx
        .select()
        .from(members)
        .where(
          and(
            eq(members.organizationId, intake.organization_id),
            eq(members.userId, newUser.id),
          ),
        )
        .limit(1);

      if (!existingMember) {
        // Add new user to organization as client
        const [newMember] = await tx.insert(members).values({
          organizationId: intake.organization_id,
          userId: newUser.id,
          role: 'client',
          createdAt: new Date(),
        }).returning();

        logger.info('Added user {userId} to organization {orgId} as client from intake {intakeId}', {
          userId: newUser.id,
          orgId: intake.organization_id,
          intakeId: intake.id,
        });

        // Dispatch event for side effects (e.g., metered billing, notifications)
        void PracticeMemberJoined.dispatch({
          member_id: newMember.id,
          intake_id: intake.id,
        }, {
          actorId: newUser.id,
          organizationId: intake.organization_id,
        });

        // Mark user as needing onboarding (profile completion)
        await tx.update(users)
          .set({ onboardingComplete: false })
          .where(eq(users.id, newUser.id));
      }
    }
  });

  logger.info('Successfully linked data from anonymous user {anonId} to {newId}', {
    anonId: anonymousUser.id,
    newId: newUser.id,
  });
};

