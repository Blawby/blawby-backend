import { clients } from '@/modules/clients/database/schema/clients.schema';
import { practiceClientIntakes } from '@/modules/practice-client-intakes/database/schema/practice-client-intakes.schema';
import { members, users } from '@/schema/better-auth-schema';
import { getActiveTx, isInTransaction, uow } from '@/shared/database/uow';
import { PracticeMemberJoined } from '@/shared/events/definitions';
import { getLogger, type Logger } from '@logtape/logtape';
import { and, eq, sql } from 'drizzle-orm';

const logger: Logger = getLogger(['auth', 'link-service']);

const MEMBER_ROLE_CLIENT = 'client' as const;

/**
 * Shared shape for "move this anonymous-owned row onto the new user, unless
 * the new user already owns an equivalent row in the same scope (org) — in
 * which case delete the anonymous row instead of duplicating it."
 *
 * Both the organization-membership migration and the client-record migration
 * follow this exact pattern; this just factors out the branching + fan-out
 * so each call site only has to supply its own typed queries.
 */
const migrateOrDedupe = async <TRow extends { id: string }>(params: {
  rows: TRow[];
  /** Does the new user already own an equivalent row in this row's scope? */
  findExisting: (row: TRow) => Promise<boolean>;
  /** Re-point this anonymous-owned row at the new user. */
  moveRow: (row: TRow) => Promise<void>;
  /** Drop this anonymous-owned row because the new user already has one. */
  deleteRow: (row: TRow) => Promise<void>;
}): Promise<void> => {
  const { rows, findExisting, moveRow, deleteRow } = params;

  await Promise.all(
    rows.map(async (row) => {
      const alreadyExists = await findExisting(row);
      if (alreadyExists) {
        await deleteRow(row);
      } else {
        await moveRow(row);
      }
    })
  );
};

/**
 * Transfers data from an anonymous user to a new user account.
 * This is called by Better Auth's onLinkAccount hook.
 */
export const linkAnonymousUserData = async (params: {
  anonymousUser: { id: string; email: string };
  newUser: { id: string; email: string };
}): Promise<void> => {
  const { anonymousUser, newUser } = params;

  if (anonymousUser.id === newUser.id) {
    // Migrating a user's data onto itself is a no-op at best; the "existing
    // Row already migrated" checks below would otherwise match the row
    // Against itself and delete it. Guard here too, independent of callers.
    logger.warn('linkAnonymousUserData called with anonymousUser.id === newUser.id, skipping {userId}', {
      userId: newUser.id,
    });
    return;
  }

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

    await migrateOrDedupe({
      rows: anonMemberships,
      findExisting: async (membership) => {
        const [existing] = await txContext
          .select()
          .from(members)
          .where(and(eq(members.organizationId, membership.organizationId), eq(members.userId, newUser.id)))
          .limit(1);
        return Boolean(existing);
      },
      moveRow: async (membership) => {
        await txContext.update(members).set({ userId: newUser.id }).where(eq(members.id, membership.id));
      },
      deleteRow: async (membership) => {
        await txContext.delete(members).where(eq(members.id, membership.id));
      },
    });

    // 2. Move client details
    const anonDetails: (typeof clients.$inferSelect)[] = await txContext
      .select()
      .from(clients)
      .where(eq(clients.user_id, anonymousUser.id));

    await migrateOrDedupe({
      rows: anonDetails,
      findExisting: async (detail) => {
        const [existing] = await txContext
          .select()
          .from(clients)
          .where(and(eq(clients.organization_id, detail.organization_id), eq(clients.user_id, newUser.id)))
          .limit(1);
        return Boolean(existing);
      },
      moveRow: async (detail) => {
        await txContext.update(clients).set({ user_id: newUser.id }).where(eq(clients.id, detail.id));
      },
      deleteRow: async (detail) => {
        await txContext.delete(clients).where(eq(clients.id, detail.id));
      },
    });

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

    await Promise.all(
      userIntakes.map(async (intake) => {
        const [existingMember] = await txContext
          .select()
          .from(members)
          .where(and(eq(members.organizationId, intake.organization_id), eq(members.userId, newUser.id)))
          .limit(1);

        if (!existingMember) {
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

          await txContext.update(users).set({ onboardingComplete: false }).where(eq(users.id, newUser.id));
        }
      })
    );
  };

  if (isInTransaction()) {
    await run();
  } else {
    await uow.transaction(run);
  }

  logger.info('Successfully linked data from anonymous user {anonId} to {newId}', {
    anonId: anonymousUser.id,
    newId: newUser.id,
  });

  await uow.afterCommit(async () => {
    await Promise.all(
      eventsToDispatch.map(async (event) => {
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
      })
    );
  });
};
