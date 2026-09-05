import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createIntake } from '@/modules/practice-client-intakes/operations/create-intake.operation';
import { getIntakeByRequestReference } from '@/modules/practice-client-intakes/operations/get-intake-by-request-reference.operation';
import { createPracticeDetails } from '@/modules/practice/database/queries/practice-details.repository';
import { intakeTemplates } from '@/modules/practice/database/schema/intake-templates.schema';
import { organizations } from '@/schema/better-auth-schema';
import { authHelpers } from '@/test/helpers/auth';
import { getTestDb } from '@/test/helpers/db';
import { intakeHelpers } from '@/test/modules/practice-client-intakes/helpers/intake';
import { eq } from 'drizzle-orm';
import { stripe } from '@/shared/utils/stripe-client';
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

// Mocked at the module boundary — these tests only exercise recovery/tenant scoping, never real Stripe I/O.
vi.mock('@/shared/utils/stripe-client', () => ({
  stripe: {
    checkout: { sessions: { create: vi.fn(), retrieve: vi.fn() } },
    paymentLinks: { create: vi.fn(), retrieve: vi.fn() },
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

const baseData = () => ({
  amount: 15000,
  email: 'client@example.com',
  name: 'Client Example',
});

describe('getIntakeByRequestReference operation — tenant-checked recovery', () => {
  let org: TestOrganization = { id: '', name: '', slug: '' };
  let ctx: LegalOperationContext = { organizationId: '', userId: null };

  beforeEach(async () => {
    vi.clearAllMocks();
    org = await authHelpers.createTestOrganization();
    ctx = { organizationId: org.id, userId: null };
  });

  it('rejects a cross-tenant caller before reading any intake', async () => {
    const otherCtx: LegalOperationContext = { organizationId: 'not-this-org', userId: null };

    await expect(
      getIntakeByRequestReference({ organizationId: org.id, requestKey: randomUUID() }, otherCtx)
    ).rejects.toMatchObject({ status: 403 });
  });

  it('returns 404 when no intake was created under this request reference for this organization', async () => {
    await expect(
      getIntakeByRequestReference({ organizationId: org.id, requestKey: randomUUID() }, ctx)
    ).rejects.toMatchObject({ status: 404 });
  });

  it('returns the same recoverable result that createIntake itself would return on a same-key retry', async () => {
    const requestKey = randomUUID();
    const created = await createIntake(
      { organizationId: org.id, data: baseData(), requestKey, subscriptionPolicy: 'enforce' },
      ctx
    );

    const recovered = await getIntakeByRequestReference({ organizationId: org.id, requestKey }, ctx);

    expect(recovered).toEqual(created);
  });

  it('rejects recovering a payment-link-bearing intake once the payment rollout is turned back off', async () => {
    await intakeHelpers.seedPublicIntakeOrganization(org.id);
    await enablePaidIntake(org.id, 15000);
    const requestKey = randomUUID();
    // SAFETY: the operation only reads `.id`/`.url` off the created payment link — a minimal fixture with just those fields is enough to exercise the recovery-gate this test checks.
    vi.mocked(stripe.paymentLinks.create).mockResolvedValueOnce({
      id: 'plink_ref_test',
      url: 'https://buy.stripe.com/test_ref',
      lastResponse: { headers: {}, requestId: 'req_test', statusCode: 200 },
    } as never);
    // SAFETY: same minimal-fixture justification as the `create` mock above.
    vi.mocked(stripe.paymentLinks.retrieve).mockResolvedValue({
      id: 'plink_ref_test',
      url: 'https://buy.stripe.com/test_ref',
      lastResponse: { headers: {}, requestId: 'req_test', statusCode: 200 },
    } as never);

    const created = await createIntake({ organizationId: org.id, data: baseData(), requestKey, subscriptionPolicy: 'enforce' }, ctx);
    expect(created.payment_link_url).toBeTruthy();

    // The read-only recovery route is gated by the same `intake-payment` rollout flag as `createIntake`'s own retry path — it must not still hand back a live payment link once that rollout group is off, even though this route belongs to `intake-without-payment`.
    await expect(
      getIntakeByRequestReference({ organizationId: org.id, requestKey, allowPaymentLinkCreation: false }, ctx)
    ).rejects.toMatchObject({ status: 403 });
  });

  it('does not recover an intake created under the same request reference for a different organization', async () => {
    const otherOrg = await authHelpers.createTestOrganization();
    const otherCtx: LegalOperationContext = { organizationId: otherOrg.id, userId: null };
    const requestKey = randomUUID();

    await createIntake(
      { organizationId: otherOrg.id, data: baseData(), requestKey, subscriptionPolicy: 'enforce' },
      otherCtx
    );

    await expect(getIntakeByRequestReference({ organizationId: org.id, requestKey }, ctx)).rejects.toMatchObject({
      status: 404,
    });
  });
});
