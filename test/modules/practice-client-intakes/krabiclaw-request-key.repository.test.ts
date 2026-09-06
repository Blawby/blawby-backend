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

    const { intake: created, isNewInsert } = await practiceClientIntakesRepository.createWithKrabiClawRequestKey(
      baseIntake(org.id, requestKey)
    );

    expect(isNewInsert).toBe(true);
    expect(created.krabiclaw_request_key).toBe(requestKey);

    const found = await practiceClientIntakesRepository.findByKrabiClawRequestKey(org.id, requestKey);
    expect(found?.id).toBe(created.id);
  });

  it('replays the same intake when the same organization reuses a request key, and reports the replay as not a new insert', async () => {
    const org = await createTestOrganization();
    const requestKey = randomUUID();

    const first = await practiceClientIntakesRepository.createWithKrabiClawRequestKey(baseIntake(org.id, requestKey));
    const second = await practiceClientIntakesRepository.createWithKrabiClawRequestKey(baseIntake(org.id, requestKey));

    expect(first.isNewInsert).toBe(true);
    expect(second.isNewInsert).toBe(false);
    expect(second.intake.id).toBe(first.intake.id);
  });

  it('does not leak an intake across organizations that happen to reuse the same request key', async () => {
    const orgA = await createTestOrganization();
    const orgB = await createTestOrganization();
    const requestKey = randomUUID();

    const { intake: intakeA, isNewInsert: isNewInsertA } =
      await practiceClientIntakesRepository.createWithKrabiClawRequestKey(baseIntake(orgA.id, requestKey));
    const { intake: intakeB, isNewInsert: isNewInsertB } =
      await practiceClientIntakesRepository.createWithKrabiClawRequestKey(baseIntake(orgB.id, requestKey));

    // Different organizations sharing a request key are not a race for the same conflict target
    // (the unique constraint is scoped per-organization), so both are genuine inserts.
    expect(isNewInsertA).toBe(true);
    expect(isNewInsertB).toBe(true);
    expect(intakeB.id).not.toBe(intakeA.id);
    await expect(practiceClientIntakesRepository.findByKrabiClawRequestKey(orgB.id, requestKey)).resolves.toMatchObject(
      { id: intakeB.id }
    );
  });

  it('marks exactly one winner when two callers race on the same organization+request key', async () => {
    const org = await createTestOrganization();
    const requestKey = randomUUID();

    const [first, second] = await Promise.all([
      practiceClientIntakesRepository.createWithKrabiClawRequestKey(baseIntake(org.id, requestKey)),
      practiceClientIntakesRepository.createWithKrabiClawRequestKey(baseIntake(org.id, requestKey)),
    ]);

    const winners = [first, second].filter((result) => result.isNewInsert);
    expect(winners).toHaveLength(1);
    expect(first.intake.id).toBe(second.intake.id);
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
