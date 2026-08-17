import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { getPracticeDetails } from '@/modules/practice/operations/get-practice-details.operation';
import { upsertPracticeDetails } from '@/modules/practice/operations/upsert-practice-details.operation';
import { getConnectStatus } from '@/modules/onboarding/operations/get-connect-status.operation';
import { authHelpers } from '@/test/helpers/auth';
import type { LegalOperationContext } from '@/shared/types/legal-operation-context';

/**
 * A Legal Operation cannot trust a caller-supplied organizationId param to match the resolved
 * tenant on LegalOperationContext (KTD19 — the operation owns its own tenant check). These tests
 * cover all four extracted U5 operations except createConnectedAccount, which has its own
 * dedicated tenant test in create-connected-account-recovery.test.ts.
 */
describe('Legal Operation tenant isolation', () => {
  it('getPracticeDetails rejects when ctx.organizationId does not match the requested organization', async () => {
    const org = await authHelpers.createTestOrganization();
    const otherOrg = await authHelpers.createTestOrganization();
    const ctx: LegalOperationContext = { organizationId: otherOrg.id, userId: randomUUID() };

    await expect(getPracticeDetails({ organizationId: org.id }, ctx)).rejects.toMatchObject({ status: 403 });
  });

  it('upsertPracticeDetails rejects when ctx.organizationId does not match the requested organization', async () => {
    const org = await authHelpers.createTestOrganization();
    const otherOrg = await authHelpers.createTestOrganization();
    const ctx: LegalOperationContext = { organizationId: otherOrg.id, userId: randomUUID() };

    await expect(upsertPracticeDetails({ organizationId: org.id, data: {} }, ctx)).rejects.toMatchObject({
      status: 403,
    });
  });

  it('getConnectStatus rejects when ctx.organizationId does not match the requested organization', async () => {
    const org = await authHelpers.createTestOrganization();
    const otherOrg = await authHelpers.createTestOrganization();
    const ctx: LegalOperationContext = { organizationId: otherOrg.id, userId: randomUUID() };

    await expect(getConnectStatus({ organizationId: org.id }, ctx)).rejects.toMatchObject({ status: 403 });
  });
});
