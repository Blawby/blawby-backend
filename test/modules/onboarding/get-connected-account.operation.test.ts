import { beforeEach, describe, expect, it } from 'vitest';

import { getConnectedAccount } from '@/modules/onboarding/operations/get-connected-account.operation';
import { onboardingRepository } from '@/modules/onboarding/database/queries/onboarding.repository';
import { authHelpers } from '@/test/helpers/auth';
import type { LegalOperationContext } from '@/shared/types/legal-operation-context';
import type { TestOrganization } from '@/test/types/shared';

describe('getConnectedAccount operation — tenant isolation and parity', () => {
  let org: TestOrganization = { id: '', name: '', slug: '' };

  beforeEach(async () => {
    org = await authHelpers.createTestOrganization();
  });

  it('rejects a cross-tenant caller', async () => {
    const otherCtx: LegalOperationContext = { organizationId: 'not-this-org', userId: null };

    await expect(getConnectedAccount({ organizationId: org.id }, otherCtx)).rejects.toMatchObject({ status: 403 });
  });

  it('returns 404 when no connected account exists for the organization', async () => {
    const ctx: LegalOperationContext = { organizationId: org.id, userId: null };

    await expect(getConnectedAccount({ organizationId: org.id }, ctx)).rejects.toMatchObject({ status: 404 });
  });

  it('returns account status when one exists, matching the existing route response shape', async () => {
    await onboardingRepository.create({
      organization_id: org.id,
      stripe_account_id: 'acct_get_op_test',
      account_type: 'custom',
      country: 'US',
      email: 'practice@example.com',
      charges_enabled: true,
      payouts_enabled: true,
      details_submitted: true,
    });

    const ctx: LegalOperationContext = { organizationId: org.id, userId: null };
    const result = await getConnectedAccount({ organizationId: org.id }, ctx);

    expect(result).toMatchObject({
      account_id: 'acct_get_op_test',
      status: {
        charges_enabled: true,
        payouts_enabled: true,
        details_submitted: true,
      },
    });
  });
});
