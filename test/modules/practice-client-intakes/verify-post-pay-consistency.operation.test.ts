import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { verifyPostPayConsistency } from '@/modules/practice-client-intakes/operations/verify-post-pay-consistency.operation';
import { practiceClientIntakesRepository } from '@/modules/practice-client-intakes/database/queries/practice-client-intakes.repository';
import { authHelpers } from '@/test/helpers/auth';
import { intakeHelpers } from '@/test/modules/practice-client-intakes/helpers/intake';
import { stripe } from '@/shared/utils/stripe-client';
import type { LegalOperationContext } from '@/shared/types/legal-operation-context';
import type { TestOrganization } from '@/test/types/shared';

vi.mock('@/shared/utils/stripe-client', () => ({
  stripe: {
    checkout: { sessions: { create: vi.fn(), retrieve: vi.fn() } },
    paymentLinks: { create: vi.fn(), retrieve: vi.fn() },
  },
}));

describe('verifyPostPayConsistency operation — post-pay correlation and conditional attach', () => {
  let org: TestOrganization = { id: '', name: '', slug: '' };
  let ctx: LegalOperationContext = { organizationId: '', userId: null };

  beforeEach(async () => {
    vi.clearAllMocks();
    org = await authHelpers.createTestOrganization();
    ctx = { organizationId: org.id, userId: null };
  });

  it('rejects a cross-tenant caller before any read', async () => {
    const otherCtx: LegalOperationContext = { organizationId: 'not-this-org', userId: null };

    await expect(
      verifyPostPayConsistency(
        { organizationId: org.id, intakeUuid: randomUUID(), sessionId: 'cs_test_x', requestKey: randomUUID() },
        otherCtx
      )
    ).rejects.toMatchObject({ status: 403 });
  });

  it('rejects an intake UUID that does not exist and performs zero writes', async () => {
    await expect(
      verifyPostPayConsistency(
        { organizationId: org.id, intakeUuid: randomUUID(), sessionId: 'cs_test_x', requestKey: randomUUID() },
        ctx
      )
    ).rejects.toMatchObject({ status: 404 });
  });

  it('rejects when the intake belongs to a different organization than requested and performs zero writes', async () => {
    const otherOrg = await authHelpers.createTestOrganization();
    const requestKey = randomUUID();
    const intake = await intakeHelpers.createTestIntake(otherOrg.id, {
      status: 'succeeded',
      krabiclaw_request_key: requestKey,
    });

    await expect(
      verifyPostPayConsistency(
        { organizationId: org.id, intakeUuid: intake.id, sessionId: 'cs_test_x', requestKey },
        ctx
      )
    ).rejects.toMatchObject({ status: 404 });

    const reloaded = await practiceClientIntakesRepository.findById(intake.id);
    expect(reloaded?.stripe_checkout_session_id).toBeNull();
  });

  it('rejects a wrong request reference and performs zero writes', async () => {
    const intake = await intakeHelpers.createTestIntake(org.id, {
      status: 'succeeded',
      krabiclaw_request_key: randomUUID(),
    });

    await expect(
      verifyPostPayConsistency(
        { organizationId: org.id, intakeUuid: intake.id, sessionId: 'cs_test_x', requestKey: randomUUID() },
        ctx
      )
    ).rejects.toMatchObject({ status: 404 });

    const reloaded = await practiceClientIntakesRepository.findById(intake.id);
    expect(reloaded?.stripe_checkout_session_id).toBeNull();
  });

  it('rejects a session that belongs to the organization but resolves to a different intake UUID', async () => {
    const requestKey = randomUUID();
    const intake = await intakeHelpers.createTestIntake(org.id, {
      status: 'succeeded',
      krabiclaw_request_key: requestKey,
    });
    const sessionId = `cs_test_${randomUUID()}`;
    intakeHelpers.mockStripeSessionRetrieve({
      id: sessionId,
      paymentStatus: 'paid',
      status: 'complete',
      metadata: { intake_uuid: randomUUID() },
    });

    await expect(
      verifyPostPayConsistency({ organizationId: org.id, intakeUuid: intake.id, sessionId, requestKey }, ctx)
    ).rejects.toMatchObject({ status: 404 });

    const reloaded = await practiceClientIntakesRepository.findById(intake.id);
    expect(reloaded?.stripe_checkout_session_id).toBeNull();
  });

  it('attaches the session id when every correlation agrees and the intake has none yet (null-to-value)', async () => {
    const requestKey = randomUUID();
    const intake = await intakeHelpers.createTestIntake(org.id, {
      status: 'succeeded',
      krabiclaw_request_key: requestKey,
    });
    const sessionId = `cs_test_${randomUUID()}`;
    intakeHelpers.mockStripeSessionRetrieve({
      id: sessionId,
      paymentStatus: 'paid',
      status: 'complete',
      metadata: { intake_uuid: intake.id },
    });

    const result = await verifyPostPayConsistency(
      { organizationId: org.id, intakeUuid: intake.id, sessionId, requestKey },
      ctx
    );

    expect(result).toEqual({ paid: true, intake_uuid: intake.id, organization_id: org.id });
    const reloaded = await practiceClientIntakesRepository.findById(intake.id);
    expect(reloaded?.stripe_checkout_session_id).toBe(sessionId);
  });

  it('is a no-op when the intake already carries this exact session id (same-value)', async () => {
    const requestKey = randomUUID();
    const sessionId = `cs_test_${randomUUID()}`;
    const intake = await intakeHelpers.createTestIntake(org.id, {
      status: 'succeeded',
      krabiclaw_request_key: requestKey,
      stripe_checkout_session_id: sessionId,
    });
    intakeHelpers.mockStripeSessionRetrieve({
      id: sessionId,
      paymentStatus: 'paid',
      status: 'complete',
      metadata: { intake_uuid: intake.id },
    });

    const result = await verifyPostPayConsistency(
      { organizationId: org.id, intakeUuid: intake.id, sessionId, requestKey },
      ctx
    );

    expect(result).toEqual({ paid: true, intake_uuid: intake.id, organization_id: org.id });
  });

  it('rejects a conflicting session id when the intake already carries a different one, with zero writes', async () => {
    const requestKey = randomUUID();
    const originalSessionId = `cs_test_${randomUUID()}`;
    const conflictingSessionId = `cs_test_${randomUUID()}`;
    const intake = await intakeHelpers.createTestIntake(org.id, {
      status: 'succeeded',
      krabiclaw_request_key: requestKey,
      stripe_checkout_session_id: originalSessionId,
    });
    intakeHelpers.mockStripeSessionRetrieve({
      id: conflictingSessionId,
      paymentStatus: 'paid',
      status: 'complete',
      metadata: { intake_uuid: intake.id },
    });

    await expect(
      verifyPostPayConsistency(
        { organizationId: org.id, intakeUuid: intake.id, sessionId: conflictingSessionId, requestKey },
        ctx
      )
    ).rejects.toMatchObject({ status: 409 });

    const reloaded = await practiceClientIntakesRepository.findById(intake.id);
    expect(reloaded?.stripe_checkout_session_id).toBe(originalSessionId);
  });

  it('concurrent attempts to attach different verified session IDs have one winner and reject the conflicting value', async () => {
    const requestKey = randomUUID();
    const intake = await intakeHelpers.createTestIntake(org.id, {
      status: 'succeeded',
      krabiclaw_request_key: requestKey,
    });
    const sessionA = `cs_test_${randomUUID()}`;
    const sessionB = `cs_test_${randomUUID()}`;

    // `intakeHelpers.mockStripeSessionRetrieve` only supports one fixture at a time
    // (`mockResolvedValue`), so a second call would silently replace the first — routing
    // Locally by session ID here instead is what makes both calls below genuinely concurrent
    // Rather than two sequential calls against a single fixed mock response.
    const sessionFixturesById = new Map<
      string,
      { id: string; payment_status: string; status: string; metadata: Record<string, string> }
    >();
    const registerSession = (id: string): void => {
      sessionFixturesById.set(id, {
        id,
        payment_status: 'paid',
        status: 'complete',
        metadata: { intake_uuid: intake.id },
      });
    };
    registerSession(sessionA);
    registerSession(sessionB);
    vi.mocked(stripe.checkout.sessions.retrieve).mockImplementation(async (sessionId: string) => {
      const fixture = sessionFixturesById.get(sessionId);
      if (!fixture) {
        throw new Error(`No mocked Stripe session fixture registered for id: ${sessionId}`);
      }
      return fixture;
    });

    type VerifyResult = Awaited<ReturnType<typeof verifyPostPayConsistency>>;
    const isFulfilled = (
      outcome: PromiseSettledResult<VerifyResult>
    ): outcome is PromiseFulfilledResult<VerifyResult> => outcome.status === 'fulfilled';
    const isRejected = (outcome: PromiseSettledResult<VerifyResult>): outcome is PromiseRejectedResult =>
      outcome.status === 'rejected';

    const outcomes = await Promise.allSettled([
      verifyPostPayConsistency({ organizationId: org.id, intakeUuid: intake.id, sessionId: sessionA, requestKey }, ctx),
      verifyPostPayConsistency({ organizationId: org.id, intakeUuid: intake.id, sessionId: sessionB, requestKey }, ctx),
    ]);

    const fulfilled = outcomes.filter(isFulfilled);
    const rejected = outcomes.filter(isRejected);
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(fulfilled[0]?.value.paid).toBe(true);
    expect(rejected[0]?.reason).toMatchObject({ status: 409 });

    const reloaded = await practiceClientIntakesRepository.findById(intake.id);
    expect([sessionA, sessionB]).toContain(reloaded?.stripe_checkout_session_id);
  });
});
