import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { practiceClientIntakesRepository } from '@/modules/practice-client-intakes/database/queries/practice-client-intakes.repository';
import type { InsertPracticeClientIntake } from '@/modules/practice-client-intakes/database/schema/practice-client-intakes.schema';
import { authHelpers } from '@/test/helpers/auth';

const { createTestOrganization } = authHelpers;

const baseIntake = (
  organizationId: string,
  requestKey: string
): InsertPracticeClientIntake & { krabiclaw_request_key: string } => ({
  organization_id: organizationId,
  amount: 1000,
  currency: 'usd',
  status: 'pending',
  triage_status: 'pending_review',
  krabiclaw_request_key: requestKey,
});

describe('practiceClientIntakesRepository krabiclaw request key', () => {
  it('creates a new intake for a fresh request key', async () => {
    const org = await createTestOrganization();
    const requestKey = randomUUID();

    const created = await practiceClientIntakesRepository.createWithKrabiClawRequestKey(
      baseIntake(org.id, requestKey)
    );

    expect(created.krabiclaw_request_key).toBe(requestKey);

    const found = await practiceClientIntakesRepository.findByKrabiClawRequestKey(org.id, requestKey);
    expect(found?.id).toBe(created.id);
  });

  it('replays the same intake when the same organization reuses a request key', async () => {
    const org = await createTestOrganization();
    const requestKey = randomUUID();

    const first = await practiceClientIntakesRepository.createWithKrabiClawRequestKey(baseIntake(org.id, requestKey));
    const second = await practiceClientIntakesRepository.createWithKrabiClawRequestKey(
      baseIntake(org.id, requestKey)
    );

    expect(second.id).toBe(first.id);
  });

  it('does not leak an intake across organizations that happen to reuse the same request key', async () => {
    const orgA = await createTestOrganization();
    const orgB = await createTestOrganization();
    const requestKey = randomUUID();

    const intakeA = await practiceClientIntakesRepository.createWithKrabiClawRequestKey(
      baseIntake(orgA.id, requestKey)
    );
    const intakeB = await practiceClientIntakesRepository.createWithKrabiClawRequestKey(
      baseIntake(orgB.id, requestKey)
    );

    expect(intakeB.id).not.toBe(intakeA.id);
    await expect(practiceClientIntakesRepository.findByKrabiClawRequestKey(orgB.id, requestKey)).resolves.toMatchObject(
      { id: intakeB.id }
    );
  });

  it('leaves regular intake creation without a request key unaffected', async () => {
    const org = await createTestOrganization();

    const created = await practiceClientIntakesRepository.create({
      organization_id: org.id,
      amount: 500,
      currency: 'usd',
      status: 'pending',
      triage_status: 'pending_review',
    });

    expect(created.krabiclaw_request_key).toBeNull();
  });
});
