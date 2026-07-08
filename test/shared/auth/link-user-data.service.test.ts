import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { clients } from '@/modules/clients/database/schema/clients.schema';
import { practiceClientIntakes } from '@/modules/practice-client-intakes/database/schema/practice-client-intakes.schema';
import { members, users } from '@/schema/better-auth-schema';
import { linkAnonymousUserData } from '@/shared/auth/services/link-user-data.service';
import { authHelpers } from '@/test/helpers/auth';
import { getTestDb } from '@/test/helpers/db';

const db = getTestDb();

const insertClient = async (params: { organizationId: string; userId: string }) => {
  const [row] = await db
    .insert(clients)
    .values({
      organization_id: params.organizationId,
      user_id: params.userId,
      name: 'Test Client',
      email: `client-${randomUUID()}@example.com`,
    })
    .returning();
  if (!row) {
    throw new Error('Failed to insert test client');
  }
  return row;
};

const insertSucceededIntake = async (params: { organizationId: string; anonymousUserId: string }) => {
  const [row] = await db
    .insert(practiceClientIntakes)
    .values({
      organization_id: params.organizationId,
      amount: 5000,
      status: 'succeeded',
      stripe_payment_intent_id: `pi_${randomUUID()}`,
      metadata: { user_id: params.anonymousUserId },
    })
    .returning();
  if (!row) {
    throw new Error('Failed to insert test intake');
  }
  return row;
};

/**
 * Regression coverage for the incident where Better Auth's anonymous plugin
 * resolved `onLinkAccount`'s anonymousUser and newUser to the SAME row
 * (an account whose `isAnonymous` flag never got cleared after a previous
 * link). linkAnonymousUserData's "already migrated?" dedupe checks matched
 * each row against itself and deleted the user's own memberships/clients.
 */
describe('linkAnonymousUserData', () => {
  describe('self-link (anonymousUser.id === newUser.id)', () => {
    it('is a no-op: it does not delete the user\'s own memberships or client records', async () => {
      const user = await authHelpers.createTestUser();
      const org = await authHelpers.createTestOrganization();
      await authHelpers.addUserToOrganization(user.id, org.id, 'client');
      const client = await insertClient({ organizationId: org.id, userId: user.id });

      await expect(
        linkAnonymousUserData({
          anonymousUser: { id: user.id, email: user.email },
          newUser: { id: user.id, email: user.email },
        })
      ).resolves.toBeUndefined();

      const membershipRows = await db.select().from(members).where(eq(members.userId, user.id));
      expect(membershipRows).toHaveLength(1);
      expect(membershipRows[0]?.organizationId).toBe(org.id);

      const clientRows = await db.select().from(clients).where(eq(clients.id, client.id));
      expect(clientRows).toHaveLength(1);
      expect(clientRows[0]?.user_id).toBe(user.id);
    });
  });

  describe('membership migration', () => {
    it("moves the anonymous user's membership onto the new user when the new user has no membership in that org", async () => {
      const anon = await authHelpers.createAnonymousUser();
      const newUser = await authHelpers.createTestUser();
      const org = await authHelpers.createTestOrganization();
      await authHelpers.addUserToOrganization(anon.id, org.id, 'client');

      await linkAnonymousUserData({
        anonymousUser: { id: anon.id, email: anon.email },
        newUser: { id: newUser.id, email: newUser.email },
      });

      const anonMemberships = await db.select().from(members).where(eq(members.userId, anon.id));
      expect(anonMemberships).toHaveLength(0);

      const newUserMemberships = await db.select().from(members).where(eq(members.userId, newUser.id));
      expect(newUserMemberships).toHaveLength(1);
      expect(newUserMemberships[0]?.organizationId).toBe(org.id);
    });

    it('deletes the anonymous membership instead of duplicating it when the new user already belongs to that org', async () => {
      const anon = await authHelpers.createAnonymousUser();
      const newUser = await authHelpers.createTestUser();
      const org = await authHelpers.createTestOrganization();
      await authHelpers.addUserToOrganization(anon.id, org.id, 'client');
      await authHelpers.addUserToOrganization(newUser.id, org.id, 'owner');

      await linkAnonymousUserData({
        anonymousUser: { id: anon.id, email: anon.email },
        newUser: { id: newUser.id, email: newUser.email },
      });

      const anonMemberships = await db.select().from(members).where(eq(members.userId, anon.id));
      expect(anonMemberships).toHaveLength(0);

      const newUserMemberships = await db
        .select()
        .from(members)
        .where(and(eq(members.userId, newUser.id), eq(members.organizationId, org.id)));
      expect(newUserMemberships).toHaveLength(1);
      // The new user's pre-existing membership survives untouched, not overwritten by the anon one.
      expect(newUserMemberships[0]?.role).toBe('owner');
    });
  });

  describe('client record migration', () => {
    it("moves the anonymous user's client record onto the new user when none exists yet", async () => {
      const anon = await authHelpers.createAnonymousUser();
      const newUser = await authHelpers.createTestUser();
      const org = await authHelpers.createTestOrganization();
      const client = await insertClient({ organizationId: org.id, userId: anon.id });

      await linkAnonymousUserData({
        anonymousUser: { id: anon.id, email: anon.email },
        newUser: { id: newUser.id, email: newUser.email },
      });

      const [updated] = await db.select().from(clients).where(eq(clients.id, client.id));
      expect(updated?.user_id).toBe(newUser.id);
    });

    it('deletes the anonymous client record instead of duplicating it when the new user already has one in that org', async () => {
      const anon = await authHelpers.createAnonymousUser();
      const newUser = await authHelpers.createTestUser();
      const org = await authHelpers.createTestOrganization();
      const anonClient = await insertClient({ organizationId: org.id, userId: anon.id });
      const newUserClient = await insertClient({ organizationId: org.id, userId: newUser.id });

      await linkAnonymousUserData({
        anonymousUser: { id: anon.id, email: anon.email },
        newUser: { id: newUser.id, email: newUser.email },
      });

      const anonClientRows = await db.select().from(clients).where(eq(clients.id, anonClient.id));
      expect(anonClientRows).toHaveLength(0);

      const survivorRows = await db.select().from(clients).where(eq(clients.id, newUserClient.id));
      expect(survivorRows).toHaveLength(1);
      expect(survivorRows[0]?.user_id).toBe(newUser.id);
    });
  });

  describe('succeeded anonymous intake conversion', () => {
    it("enrolls the new user as a client member from the anonymous user's succeeded intake", async () => {
      const anon = await authHelpers.createAnonymousUser();
      const newUser = await authHelpers.createTestUser();
      const org = await authHelpers.createTestOrganization();
      await insertSucceededIntake({ organizationId: org.id, anonymousUserId: anon.id });

      await linkAnonymousUserData({
        anonymousUser: { id: anon.id, email: anon.email },
        newUser: { id: newUser.id, email: newUser.email },
      });

      // No linking code needed beyond what's already in linkAnonymousUserData -
      // this asserts that path actually enrolls the new user, end to end.
      const newUserMemberships = await db
        .select()
        .from(members)
        .where(and(eq(members.userId, newUser.id), eq(members.organizationId, org.id)));
      expect(newUserMemberships).toHaveLength(1);
      expect(newUserMemberships[0]?.role).toBe('client');

      const [updatedUser] = await db.select().from(users).where(eq(users.id, newUser.id));
      expect(updatedUser?.onboardingComplete).toBe(false);
    });

    it('does not create a duplicate membership when the new user already belongs to the intake org', async () => {
      const anon = await authHelpers.createAnonymousUser();
      const newUser = await authHelpers.createTestUser();
      const org = await authHelpers.createTestOrganization();
      await authHelpers.addUserToOrganization(newUser.id, org.id, 'owner');
      await insertSucceededIntake({ organizationId: org.id, anonymousUserId: anon.id });

      await linkAnonymousUserData({
        anonymousUser: { id: anon.id, email: anon.email },
        newUser: { id: newUser.id, email: newUser.email },
      });

      const newUserMemberships = await db
        .select()
        .from(members)
        .where(and(eq(members.userId, newUser.id), eq(members.organizationId, org.id)));
      expect(newUserMemberships).toHaveLength(1);
      // Pre-existing membership/role is left alone, not replaced with 'client'.
      expect(newUserMemberships[0]?.role).toBe('owner');
    });

    it('ignores intakes that are not succeeded', async () => {
      const anon = await authHelpers.createAnonymousUser();
      const newUser = await authHelpers.createTestUser();
      const org = await authHelpers.createTestOrganization();
      const [pendingIntake] = await db
        .insert(practiceClientIntakes)
        .values({
          organization_id: org.id,
          amount: 5000,
          status: 'pending',
          stripe_payment_intent_id: `pi_${randomUUID()}`,
          metadata: { user_id: anon.id },
        })
        .returning();
      expect(pendingIntake).toBeDefined();

      await linkAnonymousUserData({
        anonymousUser: { id: anon.id, email: anon.email },
        newUser: { id: newUser.id, email: newUser.email },
      });

      const newUserMemberships = await db.select().from(members).where(eq(members.userId, newUser.id));
      expect(newUserMemberships).toHaveLength(0);
    });
  });
});
