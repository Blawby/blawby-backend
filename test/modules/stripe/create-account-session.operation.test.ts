import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createAccountSession } from '@/modules/stripe/operations/create-account-session.operation';
import { onboardingRepository } from '@/modules/onboarding/database/queries/onboarding.repository';
import { authHelpers } from '@/test/helpers/auth';
import type { LegalOperationContext } from '@/shared/types/legal-operation-context';
import type { TestOrganization } from '@/test/types/shared';

interface MockAccountSession {
  client_secret: string;
  expires_at: number;
}

interface MockCreateAccountSessionParams {
  account: string;
}

// `vi.mock` is hoisted above everything, including plain top-level consts — vi.hoisted() defers this mock function's creation to run alongside that hoisting so the factory below can see it.
const { mockAccountSessionsCreate } = vi.hoisted(() => ({
  mockAccountSessionsCreate: vi.fn<(params: MockCreateAccountSessionParams) => Promise<MockAccountSession>>(),
}));

vi.mock('@/shared/utils/stripe-client', () => ({
  stripe: {
    accountSessions: {
      create: mockAccountSessionsCreate,
    },
  },
}));

describe('createAccountSession operation — tenant isolation and Stripe ordering', () => {
  let org: TestOrganization = { id: '', name: '', slug: '' };

  beforeEach(async () => {
    vi.clearAllMocks();
    org = await authHelpers.createTestOrganization();
  });

  it('rejects a cross-tenant caller before touching Stripe', async () => {
    const otherCtx: LegalOperationContext = { organizationId: 'not-this-org', userId: null };

    await expect(
      createAccountSession({ organizationId: org.id, components: ['payments'] }, otherCtx)
    ).rejects.toMatchObject({ status: 403 });

    expect(mockAccountSessionsCreate).not.toHaveBeenCalled();
  });

  it('rejects when no connected account exists for the organization, before touching Stripe', async () => {
    const ctx: LegalOperationContext = { organizationId: org.id, userId: null };

    await expect(createAccountSession({ organizationId: org.id, components: ['payments'] }, ctx)).rejects.toMatchObject(
      { status: 404 }
    );

    expect(mockAccountSessionsCreate).not.toHaveBeenCalled();
  });

  it('creates an account session when a connected account exists for the organization', async () => {
    await onboardingRepository.create({
      organization_id: org.id,
      stripe_account_id: 'acct_session_op_test',
      account_type: 'custom',
      country: 'US',
      email: 'practice@example.com',
      charges_enabled: true,
      payouts_enabled: true,
      details_submitted: true,
    });
    mockAccountSessionsCreate.mockResolvedValueOnce({
      client_secret: 'accs_secret_test',
      expires_at: 1700000000,
    });

    const ctx: LegalOperationContext = { organizationId: org.id, userId: null };
    const result = await createAccountSession({ organizationId: org.id, components: ['payments'] }, ctx);

    expect(result).toEqual({
      client_secret: 'accs_secret_test',
      expires_at: 1700000000,
      account_id: 'acct_session_op_test',
    });
    expect(mockAccountSessionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ account: 'acct_session_op_test' })
    );
  });
});
