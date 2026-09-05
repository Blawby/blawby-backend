import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { eq } from 'drizzle-orm';
import { createIntake } from '@/modules/practice-client-intakes/operations/create-intake.operation';
import { practiceClientIntakesRepository } from '@/modules/practice-client-intakes/database/queries/practice-client-intakes.repository';
import { createPracticeDetails } from '@/modules/practice/database/queries/practice-details.repository';
import { addresses } from '@/modules/practice/database/schema/addresses.schema';
import { intakeTemplates } from '@/modules/practice/database/schema/intake-templates.schema';
import { organizations } from '@/schema/better-auth-schema';
import { authHelpers } from '@/test/helpers/auth';
import { getTestDb } from '@/test/helpers/db';
import { intakeHelpers } from '@/test/modules/practice-client-intakes/helpers/intake';
import type { LegalOperationContext } from '@/shared/types/legal-operation-context';
import type { TestOrganization } from '@/test/types/shared';

const enablePaidIntake = async (organizationId: string, consultationFee: number): Promise<void> => {
  await getTestDb().update(organizations).set({ paymentLinkEnabled: true }).where(eq(organizations.id, organizationId));
  const owner = await authHelpers.createTestUser();
  await createPracticeDetails({
    organization_id: organizationId,
    user_id: owner.id,
    consultation_fee: consultationFee,
  });
  await getTestDb().insert(intakeTemplates).values({
    organization_id: organizationId,
    slug: 'default',
    name: 'Default Intake',
    status: 'published',
    is_default: true,
  });
};

const { mockPaymentLinksCreate, mockPaymentLinksRetrieve } = vi.hoisted(() => ({
  mockPaymentLinksCreate: vi.fn(),
  mockPaymentLinksRetrieve: vi.fn(),
}));

// Mocked at the module boundary so no real Stripe call is ever made from this operation test.
vi.mock('@/shared/utils/stripe-client', () => ({
  stripe: {
    paymentLinks: {
      create: mockPaymentLinksCreate,
      retrieve: mockPaymentLinksRetrieve,
    },
  },
}));

vi.mock('@/shared/events/definitions', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    IntakePaymentCreated: { dispatch: vi.fn() },
    IntakeSubmitted: { dispatch: vi.fn() },
  };
});

const stripeResponse = <T extends object>(data: T) => ({
  ...data,
  lastResponse: { headers: {}, requestId: 'req_test', statusCode: 200 },
});

const baseData = () => ({
  amount: 15000,
  email: 'client@example.com',
  name: 'Client Example',
});

describe('createIntake operation — facade idempotency and tenant isolation', () => {
  let org: TestOrganization = { id: '', name: '', slug: '' };
  let ctx: LegalOperationContext = { organizationId: '', userId: null };

  beforeEach(async () => {
    vi.clearAllMocks();
    org = await authHelpers.createTestOrganization();
    ctx = { organizationId: org.id, userId: null };
  });

  it('rejects when the context organization does not match the requested organization', async () => {
    const otherOrg = await authHelpers.createTestOrganization();
    const mismatchedCtx: LegalOperationContext = { organizationId: otherOrg.id, userId: null };

    await expect(
      createIntake({ organizationId: org.id, data: baseData(), subscriptionPolicy: 'enforce' }, mismatchedCtx)
    ).rejects.toMatchObject({
      status: 403,
    });
    expect(mockPaymentLinksCreate).not.toHaveBeenCalled();
  });

  it('creates a payment-bypassed intake for an anonymous actor with no local user row', async () => {
    const response = await createIntake(
      { organizationId: org.id, data: baseData(), subscriptionPolicy: 'enforce' },
      ctx
    );

    expect(response.status).toBe('succeeded');
    const stored = await practiceClientIntakesRepository.findById(response.uuid);
    expect(stored?.metadata?.user_id).toBeUndefined();
  });

  it('recovers the original intake on a same-key retry without creating a duplicate Stripe payment link', async () => {
    await intakeHelpers.seedPublicIntakeOrganization(org.id);
    await enablePaidIntake(org.id, 15000);
    mockPaymentLinksCreate.mockResolvedValueOnce(
      stripeResponse({ id: 'plink_1', url: 'https://buy.stripe.com/test_1' })
    );
    mockPaymentLinksRetrieve.mockResolvedValue(stripeResponse({ id: 'plink_1', url: 'https://buy.stripe.com/test_1' }));

    const requestKey = randomUUID();
    const data = baseData();

    const first = await createIntake({ organizationId: org.id, data, requestKey, subscriptionPolicy: 'enforce' }, ctx);
    const second = await createIntake({ organizationId: org.id, data, requestKey, subscriptionPolicy: 'enforce' }, ctx);

    expect(second.uuid).toBe(first.uuid);
    expect(second.payment_link_url).toBe(first.payment_link_url);
    expect(mockPaymentLinksCreate).toHaveBeenCalledTimes(1);
    expect(mockPaymentLinksCreate).toHaveBeenCalledWith(expect.anything(), {
      idempotencyKey: `krabiclaw-intake:${org.id}:${requestKey}`,
    });

    const stored = await practiceClientIntakesRepository.findByKrabiClawRequestKey(org.id, requestKey);
    expect(stored?.id).toBe(first.uuid);
  });

  it('rejects payment-link creation when the caller explicitly signals the payment rollout is off, even for a payment-enabled practice', async () => {
    await intakeHelpers.seedPublicIntakeOrganization(org.id);
    await enablePaidIntake(org.id, 15000);

    await expect(
      createIntake(
        { organizationId: org.id, data: baseData(), subscriptionPolicy: 'enforce', allowPaymentLinkCreation: false },
        ctx
      )
    ).rejects.toMatchObject({ status: 403 });
    expect(mockPaymentLinksCreate).not.toHaveBeenCalled();
  });

  it('still creates a payment link when allowPaymentLinkCreation is omitted (the ordinary Blawby route has no rollout concept)', async () => {
    await intakeHelpers.seedPublicIntakeOrganization(org.id);
    await enablePaidIntake(org.id, 15000);
    mockPaymentLinksCreate.mockResolvedValueOnce(
      stripeResponse({ id: 'plink_2', url: 'https://buy.stripe.com/test_2' })
    );

    const response = await createIntake({ organizationId: org.id, data: baseData(), subscriptionPolicy: 'enforce' }, ctx);

    expect(response.payment_link_url).toBe('https://buy.stripe.com/test_2');
    expect(mockPaymentLinksCreate).toHaveBeenCalledTimes(1);
  });

  it('rejects a same-key retry that would recover a payment link once the payment rollout is turned back off', async () => {
    await intakeHelpers.seedPublicIntakeOrganization(org.id);
    await enablePaidIntake(org.id, 15000);
    mockPaymentLinksCreate.mockResolvedValueOnce(
      stripeResponse({ id: 'plink_3', url: 'https://buy.stripe.com/test_3' })
    );

    const requestKey = randomUUID();
    const data = baseData();

    // First attempt succeeds while the payment rollout is on (or the caller has no rollout concept at all).
    const first = await createIntake({ organizationId: org.id, data, requestKey, subscriptionPolicy: 'enforce' }, ctx);
    expect(first.payment_link_url).toBe('https://buy.stripe.com/test_3');

    // The retry hits the recovery path (findRecoverableIntakeByRequestKey), not fresh creation — it must be gated by the CURRENT allowPaymentLinkCreation value too, not just skip the check entirely because a row already exists.
    await expect(
      createIntake(
        { organizationId: org.id, data, requestKey, subscriptionPolicy: 'enforce', allowPaymentLinkCreation: false },
        ctx
      )
    ).rejects.toMatchObject({ status: 403 });
    expect(mockPaymentLinksCreate).toHaveBeenCalledTimes(1);
  });

  it('writes exactly one address row when two callers race on the same request key, never an orphan for the loser', async () => {
    await intakeHelpers.seedPublicIntakeOrganization(org.id);
    const requestKey = randomUUID();
    const data = {
      ...baseData(),
      address: { line1: '1 Main St', city: 'Springfield', state: 'IL', postal_code: '62701', country: 'US' },
    };

    const [first, second] = await Promise.all([
      createIntake({ organizationId: org.id, data, requestKey, subscriptionPolicy: 'enforce' }, ctx),
      createIntake({ organizationId: org.id, data, requestKey, subscriptionPolicy: 'enforce' }, ctx),
    ]);

    expect(second.uuid).toBe(first.uuid);
    const stored = await practiceClientIntakesRepository.findByKrabiClawRequestKey(org.id, requestKey);
    expect(stored?.address_id).toBeTruthy();

    // Anonymous callers (`ctx.userId === null`) have no existing address to reuse, so `upsertAddress` always inserts a fresh row -- exactly one, from the actual insert winner, never a second orphaned row from the loser of the `ON CONFLICT DO NOTHING` race.
    const addressRows = await getTestDb().select().from(addresses).where(eq(addresses.organization_id, org.id));
    expect(addressRows).toHaveLength(1);
    expect(addressRows[0]?.id).toBe(stored?.address_id);
  });

  it('reuses the same intake id and Stripe idempotency key when the DB persist is lost after Stripe already succeeded', async () => {
    await intakeHelpers.seedPublicIntakeOrganization(org.id);
    await enablePaidIntake(org.id, 15000);
    mockPaymentLinksCreate.mockResolvedValue(
      stripeResponse({ id: 'plink_recovery', url: 'https://buy.stripe.com/test_recovery' })
    );
    mockPaymentLinksRetrieve.mockResolvedValue(
      stripeResponse({ id: 'plink_recovery', url: 'https://buy.stripe.com/test_recovery' })
    );

    const requestKey = randomUUID();
    const data = baseData();

    // Simulate a crash between the successful Stripe call and the DB insert on the first attempt.
    const createSpy = vi
      .spyOn(practiceClientIntakesRepository, 'createWithKrabiClawRequestKey')
      .mockRejectedValueOnce(new Error('simulated persist failure'));

    await expect(
      createIntake({ organizationId: org.id, data, requestKey, subscriptionPolicy: 'enforce' }, ctx)
    ).rejects.toThrow('simulated persist failure');

    createSpy.mockRestore();

    const retried = await createIntake(
      { organizationId: org.id, data, requestKey, subscriptionPolicy: 'enforce' },
      ctx
    );

    expect(mockPaymentLinksCreate).toHaveBeenCalledTimes(2);
    const [firstCallArgs, secondCallArgs] = mockPaymentLinksCreate.mock.calls;
    const [firstBody, firstOptions] = firstCallArgs;
    const [secondBody, secondOptions] = secondCallArgs;

    // Same idempotency key on both attempts (required for Stripe to treat them as one retry)...
    expect(firstOptions).toEqual(secondOptions);
    expect(secondOptions).toEqual({ idempotencyKey: `krabiclaw-intake:${org.id}:${requestKey}` });
    // ...and identical request parameters, since a fresh random intake id on the retry would make
    // Stripe reject it as an idempotency-key/parameter mismatch instead of returning the cached link.
    expect(firstBody.payment_intent_data.metadata.intake_uuid).toBe(secondBody.payment_intent_data.metadata.intake_uuid);
    expect(retried.uuid).toBe(firstBody.payment_intent_data.metadata.intake_uuid);
  });

  it('creates separate intakes when the same request key is reused across organizations', async () => {
    const otherOrg = await authHelpers.createTestOrganization();
    const otherCtx: LegalOperationContext = { organizationId: otherOrg.id, userId: null };
    const requestKey = randomUUID();

    const first = await createIntake(
      { organizationId: org.id, data: baseData(), requestKey, subscriptionPolicy: 'enforce' },
      ctx
    );
    const second = await createIntake(
      { organizationId: otherOrg.id, data: baseData(), requestKey, subscriptionPolicy: 'enforce' },
      otherCtx
    );

    expect(second.uuid).not.toBe(first.uuid);

    const resolvedForOrg = await practiceClientIntakesRepository.findByKrabiClawRequestKey(org.id, requestKey);
    const resolvedForOtherOrg = await practiceClientIntakesRepository.findByKrabiClawRequestKey(
      otherOrg.id,
      requestKey
    );
    expect(resolvedForOrg?.id).toBe(first.uuid);
    expect(resolvedForOtherOrg?.id).toBe(second.uuid);
  });
});
