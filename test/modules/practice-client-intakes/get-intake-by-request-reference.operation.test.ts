import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createIntake } from '@/modules/practice-client-intakes/operations/create-intake.operation';
import { getIntakeByRequestReference } from '@/modules/practice-client-intakes/operations/get-intake-by-request-reference.operation';
import { authHelpers } from '@/test/helpers/auth';
import type { LegalOperationContext } from '@/shared/types/legal-operation-context';
import type { TestOrganization } from '@/test/types/shared';

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
