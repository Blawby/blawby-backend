import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { getIntakeStatusByRequestReference } from '@/modules/practice-client-intakes/operations/get-intake-status-by-request-reference.operation';
import type { IntakeActorContext } from '@/modules/practice-client-intakes/operations/intake-actor-context';
import { authHelpers } from '@/test/helpers/auth';
import { intakeHelpers } from '@/test/modules/practice-client-intakes/helpers/intake';
import type { TestOrganization } from '@/test/types/shared';

describe('getIntakeStatusByRequestReference operation — facade follow-up authorization (KTD19)', () => {
  const anonymousCtx = (organizationId: string): IntakeActorContext => ({
    organizationId,
    userId: null,
    isStaff: true,
  });

  it('returns the status when the trusted request reference matches the intake', async () => {
    const org: TestOrganization = await authHelpers.createTestOrganization();
    const requestReference = randomUUID();
    const intake = await intakeHelpers.createTestIntake(org.id, { krabiclaw_request_key: requestReference });

    const result = await getIntakeStatusByRequestReference(
      { uuid: intake.id, requestReference },
      anonymousCtx(org.id)
    );

    expect(result.uuid).toBe(intake.id);
  });

  it('rejects with the uniform 404 when the request reference does not match the intake\'s own key', async () => {
    const org: TestOrganization = await authHelpers.createTestOrganization();
    const intake = await intakeHelpers.createTestIntake(org.id, { krabiclaw_request_key: randomUUID() });

    await expect(
      getIntakeStatusByRequestReference({ uuid: intake.id, requestReference: randomUUID() }, anonymousCtx(org.id))
    ).rejects.toMatchObject({ status: 404 });
  });

  it('rejects with the same 404 shape when the intake has no request key at all', async () => {
    const org: TestOrganization = await authHelpers.createTestOrganization();
    const intake = await intakeHelpers.createTestIntake(org.id, {});

    await expect(
      getIntakeStatusByRequestReference({ uuid: intake.id, requestReference: randomUUID() }, anonymousCtx(org.id))
    ).rejects.toMatchObject({ status: 404 });
  });

  it('rejects a cross-tenant caller before ever comparing the request reference', async () => {
    const org: TestOrganization = await authHelpers.createTestOrganization();
    const otherOrg: TestOrganization = await authHelpers.createTestOrganization();
    const requestReference = randomUUID();
    const intake = await intakeHelpers.createTestIntake(org.id, { krabiclaw_request_key: requestReference });

    await expect(
      getIntakeStatusByRequestReference({ uuid: intake.id, requestReference }, anonymousCtx(otherOrg.id))
    ).rejects.toMatchObject({ status: 403 });
  });

  it('never renders the staff/admin projection, even though isStaff is set to bypass the ownership check', async () => {
    const org: TestOrganization = await authHelpers.createTestOrganization();
    const requestReference = randomUUID();
    const intake = await intakeHelpers.createTestIntake(org.id, {
      krabiclaw_request_key: requestReference,
      metadata: { email: 'client@example.com', name: 'Client Example' },
      transcript_summary: 'internal staff note',
    });

    const result = await getIntakeStatusByRequestReference(
      { uuid: intake.id, requestReference },
      anonymousCtx(org.id)
    );

    // `isStaff: true` only bypasses the ownership check inside `getActorAccessibleIntake` — it must never also unlock the staff/admin response projection for this anonymous-or-human facade route, so `transcript_summary` stays undefined and the contact metadata stays blank.
    expect(result.transcript_summary).toBeUndefined();
    expect(result.metadata).toEqual({ email: '', name: '' });
  });
});
