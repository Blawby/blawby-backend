import { getLogger, type Logger } from '@logtape/logtape';
import { eq, and, sql } from 'drizzle-orm';
import { practiceClientIntakes } from '@/modules/practice-client-intakes/database/schema/practice-client-intakes.schema';
import { clients } from '@/modules/clients/database/schema/clients.schema';
import { members, users } from '@/schema/better-auth-schema';
import { db } from '@/shared/database';
import { PracticeMemberJoined } from '@/shared/events/definitions';
import { getActiveTx, uow } from '@/shared/database/uow';

const logger: Logger = getLogger(['auth', 'link-service']);

const MEMBER_ROLE_CLIENT = 'client' as const;

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

  const eventsToDispatch: {
    payload: { member_id: string; intake_id: string };
    options: { actorId: string; organizationId: string };
  }[] = [];

  const run = async () => {
    const txContext = getActiveTx();

    // 1. Move organization memberships
    const anonMemberships: (typeof members.$inferSelect)[] = await txContext
      .select()
      .from(members)
      .where(eq(members.userId, anonymousUser.id));

    for (const membership of anonMemberships) {
      // Check if new user already belongs to this organization
      const [existing] = await txContext
        .select()
        .from(members)
        .where(and(eq(members.organizationId, membership.organizationId), eq(members.userId, newUser.id)))
        .limit(1);

      if (existing) {
        // New user already in this org, just delete the anonymous membership
        await txContext.delete(members).where(eq(members.id, membership.id));
      } else {
        // Move membership to new user
        await txContext.update(members).set({ userId: newUser.id }).where(eq(members.id, membership.id));
      }
    }

    // 2. Move Client Details
    const anonDetails: (typeof clients.$inferSelect)[] = await txContext
      .select()
      .from(clients)
      .where(eq(clients.user_id, anonymousUser.id));

    for (const detail of anonDetails) {
      // Check if new user already has details in this organization
      const [existing] = await txContext
        .select()
        .from(clients)
        .where(and(eq(clients.organization_id, detail.organization_id), eq(clients.user_id, newUser.id)))
        .limit(1);

      if (existing) {
        // New user already has details, delete the anonymous ones
        await txContext.delete(clients).where(eq(clients.id, detail.id));
      } else {
        // Move details to new user
        await txContext.update(clients).set({ user_id: newUser.id }).where(eq(clients.id, detail.id));
      }
    }

    // 3. Check for succeeded intakes and add user to organization as client
    const userIntakes: (typeof practiceClientIntakes.$inferSelect)[] = await txContext
      .select()
      .from(practiceClientIntakes)
      .where(
        and(
          eq(practiceClientIntakes.status, 'succeeded'),
          eq(sql<string>`${practiceClientIntakes.metadata} ->> 'user_id'`, anonymousUser.id)
        )
      );

    for (const intake of userIntakes) {
      // Check if new user already belongs to this organization
      const [existingMember] = await txContext
        .select()
        .from(members)
        .where(and(eq(members.organizationId, intake.organization_id), eq(members.userId, newUser.id)))
        .limit(1);

      if (!existingMember) {
        // Add new user to organization as client
        const [newMember] = await txContext
          .insert(members)
          .values({
            organizationId: intake.organization_id,
            userId: newUser.id,
            role: MEMBER_ROLE_CLIENT,
            createdAt: new Date(),
          })
          .returning();

        logger.info('Added user {userId} to organization {orgId} as client from intake {intakeId}', {
          userId: newUser.id,
          orgId: intake.organization_id,
          intakeId: intake.id,
        });

        // Queue event dispatch for after transaction commit
        eventsToDispatch.push({
          payload: {
            member_id: newMember.id,
            intake_id: intake.id,
          },
          options: {
            actorId: newUser.id,
            organizationId: intake.organization_id,
          },
        });

        // Mark user as needing onboarding (profile completion)
        await txContext.update(users).set({ onboardingComplete: false }).where(eq(users.id, newUser.id));
      }
    }
  };

  if (getActiveTx() !== db) {
    await run();
  } else {
    await uow.transaction(run);
  }

  logger.info('Successfully linked data from anonymous user {anonId} to {newId}', {
    anonId: anonymousUser.id,
    newId: newUser.id,
  });

  // Dispatch queued events
  for (const event of eventsToDispatch) {
    try {
      await PracticeMemberJoined.dispatch(event.payload, event.options);
    } catch (error) {
      logger.error('Failed to dispatch PracticeMemberJoined event', {
        error,
        member_id: event.payload.member_id,
        intake_id: event.payload.intake_id,
        actorId: event.options.actorId,
        organizationId: event.options.organizationId,
      });
    }
  }
};
