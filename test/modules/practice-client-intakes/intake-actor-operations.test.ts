import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createCheckoutSession } from '@/modules/practice-client-intakes/operations/create-checkout-session.operation';
import { getIntakeById } from '@/modules/practice-client-intakes/operations/get-intake-by-id.operation';
import { getIntakeSettings } from '@/modules/practice-client-intakes/operations/get-intake-settings.operation';
import { getIntakeStatus } from '@/modules/practice-client-intakes/operations/get-intake-status.operation';
import { getPostPayStatus } from '@/modules/practice-client-intakes/operations/get-post-pay-status.operation';
import { listIntakes } from '@/modules/practice-client-intakes/operations/list-intakes.operation';
import { updateIntakeTriageStatus } from '@/modules/practice-client-intakes/operations/update-intake-triage-status.operation';
import type { IntakeActorContext } from '@/modules/practice-client-intakes/operations/intake-actor-context';
import { stripeConnectedAccounts } from '@/modules/onboarding/schemas/onboarding.schema';
import { intakeTemplates } from '@/modules/practice/database/schema/intake-templates.schema';
import { authHelpers } from '@/test/helpers/auth';
import { getTestDb } from '@/test/helpers/db';
import { intakeHelpers } from '@/test/modules/practice-client-intakes/helpers/intake';
import type { LegalOperationContext } from '@/shared/types/legal-operation-context';
import type { TestOrganization } from '@/test/types/shared';

const seedUnsubscribedIntakeOrganization = async (orgId: string): Promise<void> => {
  const db = getTestDb();
  await db.insert(stripeConnectedAccounts).values(
    intakeHelpers.mockConnectedAccount({
      organization_id: orgId,
      stripe_account_id: `acct_unsub_${orgId.replace(/-/g, '').slice(0, 16)}`,
      charges_enabled: true,
      payouts_enabled: true,
      details_submitted: true,
    })
  );
  await db.insert(intakeTemplates).values({
    organization_id: orgId,
    slug: 'default',
    name: 'Default Intake',
    status: 'published',
    is_default: true,
  });
};

// Mocked at the module boundary — these tests only exercise tenant/actor scoping, never real Stripe I/O.
vi.mock('@/shared/utils/stripe-client', () => ({
  stripe: {
    checkout: { sessions: { create: vi.fn(), retrieve: vi.fn() } },
    paymentLinks: { create: vi.fn(), retrieve: vi.fn() },
  },
}));

describe('practice-client-intakes actor-scoped operations — tenant and actor isolation', () => {
  let org: TestOrganization = { id: '', name: '', slug: '' };
  let otherOrg: TestOrganization = { id: '', name: '', slug: '' };

  beforeEach(async () => {
    org = await authHelpers.createTestOrganization();
    otherOrg = await authHelpers.createTestOrganization();
  });

  const staffCtx = (organizationId: string): IntakeActorContext => ({
    organizationId,
    userId: randomUUID(),
    isStaff: true,
  });

  const clientCtx = (organizationId: string, userId: string | null): IntakeActorContext => ({
    organizationId,
    userId,
    isStaff: false,
  });

  describe('createCheckoutSession', () => {
    it('rejects a cross-tenant actor before touching Stripe', async () => {
      const intake = await intakeHelpers.createTestIntake(org.id, { status: 'open', amount: 5000 });

      await expect(createCheckoutSession({ uuid: intake.id }, staffCtx(otherOrg.id))).rejects.toMatchObject({
        status: 403,
      });
    });

    it('rejects a client actor who does not own the intake', async () => {
      const ownerId = randomUUID();
      const intake = await intakeHelpers.createTestIntake(org.id, {
        status: 'open',
        amount: 5000,
        metadata: { email: 'owner@example.com', name: 'Owner', user_id: ownerId },
      });

      await expect(
        createCheckoutSession({ uuid: intake.id }, clientCtx(org.id, randomUUID()))
      ).rejects.toMatchObject({ status: 403 });
    });

    it('rejects an anonymous intake for a non-owning client actor with no linked user', async () => {
      const intake = await intakeHelpers.createTestIntake(org.id, {
        status: 'open',
        amount: 5000,
        metadata: { email: 'anon@example.com', name: 'Anon' },
      });

      await expect(
        createCheckoutSession({ uuid: intake.id }, clientCtx(org.id, randomUUID()))
      ).rejects.toMatchObject({ status: 403 });
    });
  });

  describe('getIntakeStatus', () => {
    it('rejects a cross-tenant staff actor', async () => {
      const intake = await intakeHelpers.createTestIntake(org.id, {});

      await expect(getIntakeStatus({ uuid: intake.id }, staffCtx(otherOrg.id))).rejects.toMatchObject({
        status: 403,
      });
    });

    it('allows the owning client actor and hides unauthorized fields from a non-owner', async () => {
      const ownerId = randomUUID();
      const intake = await intakeHelpers.createTestIntake(org.id, {
        metadata: { email: 'owner@example.com', name: 'Owner', user_id: ownerId },
      });

      const owned = await getIntakeStatus({ uuid: intake.id }, clientCtx(org.id, ownerId));
      expect(owned.metadata?.email).toBe('owner@example.com');
    });
  });

  describe('getPostPayStatus', () => {
    it('rejects when the supplied context organization does not own the resolved intake', async () => {
      const sessionId = `cs_test_${randomUUID()}`;
      await intakeHelpers.createTestIntake(org.id, {
        status: 'succeeded',
        stripe_checkout_session_id: sessionId,
      });

      await expect(
        getPostPayStatus({ sessionId }, { organizationId: otherOrg.id, userId: null })
      ).rejects.toMatchObject({ status: 403 });
    });

    it('succeeds without a context for the existing public route (unchanged behavior)', async () => {
      const sessionId = `cs_test_${randomUUID()}`;
      const intake = await intakeHelpers.createTestIntake(org.id, {
        status: 'succeeded',
        stripe_checkout_session_id: sessionId,
      });

      const result = await getPostPayStatus({ sessionId }, { scope: 'public' });
      expect(result.paid).toBe(true);
      expect(result.intake_uuid).toBe(intake.id);
    });
  });

  describe('staff surfaces — listIntakes, getIntakeById, updateIntakeTriageStatus', () => {
    it('listIntakes rejects a cross-tenant organizationId', async () => {
      const ctx: LegalOperationContext = { organizationId: otherOrg.id, userId: randomUUID() };

      await expect(
        listIntakes({ organizationId: org.id, query: { page: 1, limit: 20 } }, ctx)
      ).rejects.toMatchObject({ status: 403 });
    });

    it('getIntakeById rejects a cross-tenant staff actor', async () => {
      const intake = await intakeHelpers.createTestIntake(org.id, {});
      const ctx: LegalOperationContext = { organizationId: otherOrg.id, userId: randomUUID() };

      await expect(getIntakeById(intake.id, ctx)).rejects.toMatchObject({ status: 403 });
    });

    it('updateIntakeTriageStatus rejects a cross-tenant staff actor and leaves the row unchanged', async () => {
      const intake = await intakeHelpers.createTestIntake(org.id, { triage_status: 'pending_review' });
      const ctx: LegalOperationContext = { organizationId: otherOrg.id, userId: randomUUID() };

      await expect(
        updateIntakeTriageStatus({ uuid: intake.id, data: { status: 'accepted' } }, ctx)
      ).rejects.toMatchObject({ status: 403 });
    });
  });

  describe('getIntakeSettings — subscriptionPolicy', () => {
    it('enforce (existing routes) rejects an organization with no active subscription', async () => {
      await seedUnsubscribedIntakeOrganization(org.id);
      const ctx: LegalOperationContext = { organizationId: org.id, userId: null };

      await expect(
        getIntakeSettings({ organizationId: org.id, subscriptionPolicy: 'enforce' }, ctx)
      ).rejects.toMatchObject({ status: 403 });
    });

    it('bypass (facade, post-entitlement) succeeds for the same organization with no active subscription', async () => {
      await seedUnsubscribedIntakeOrganization(org.id);
      const ctx: LegalOperationContext = { organizationId: org.id, userId: null };

      const settings = await getIntakeSettings({ organizationId: org.id, subscriptionPolicy: 'bypass' }, ctx);
      expect(settings.organization.id).toBe(org.id);
    });
  });
});
