import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { eq } from 'drizzle-orm';
import { createIntake } from '@/modules/practice-client-intakes/operations/create-intake.operation';
import { practiceClientIntakesRepository } from '@/modules/practice-client-intakes/database/queries/practice-client-intakes.repository';
import { createPracticeDetails } from '@/modules/practice/database/queries/practice-details.repository';
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

    await expect(createIntake({ organizationId: org.id, data: baseData() }, mismatchedCtx)).rejects.toMatchObject({
      status: 403,
    });
    expect(mockPaymentLinksCreate).not.toHaveBeenCalled();
  });

  it('creates a payment-bypassed intake for an anonymous actor with no local user row', async () => {
    const response = await createIntake({ organizationId: org.id, data: baseData() }, ctx);

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

    const first = await createIntake({ organizationId: org.id, data, requestKey }, ctx);
    const second = await createIntake({ organizationId: org.id, data, requestKey }, ctx);

    expect(second.uuid).toBe(first.uuid);
    expect(second.payment_link_url).toBe(first.payment_link_url);
    expect(mockPaymentLinksCreate).toHaveBeenCalledTimes(1);

    const stored = await practiceClientIntakesRepository.findByKrabiClawRequestKey(org.id, requestKey);
    expect(stored?.id).toBe(first.uuid);
  });

  it('creates separate intakes when the same request key is reused across organizations', async () => {
    const otherOrg = await authHelpers.createTestOrganization();
    const otherCtx: LegalOperationContext = { organizationId: otherOrg.id, userId: null };
    const requestKey = randomUUID();

    const first = await createIntake({ organizationId: org.id, data: baseData(), requestKey }, ctx);
    const second = await createIntake({ organizationId: otherOrg.id, data: baseData(), requestKey }, otherCtx);

    expect(second.uuid).not.toBe(first.uuid);
  });
});
