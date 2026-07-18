import { practiceClientIntakesRepository } from '@/modules/practice-client-intakes/database/queries/practice-client-intakes.repository';
import type { SelectPracticeClientIntake } from '@/modules/practice-client-intakes/database/schema/practice-client-intakes.schema';
import { intakeEnrichmentService } from '@/modules/practice-client-intakes/services/intake-enrichment.service';
import { queueManager } from '@/shared/queue/queue.manager';
import { createSystemContext } from '@/shared/types/service-context';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/modules/practice-client-intakes/database/queries/practice-client-intakes.repository', () => ({
  practiceClientIntakesRepository: {
    findById: vi.fn(),
    requestEnrichment: vi.fn(),
    claimEnrichment: vi.fn(),
    completeEnrichment: vi.fn(),
    failEnrichment: vi.fn(),
  },
}));

vi.mock('@/modules/intake-conversations/database/queries/intake-conversation-messages.queries', () => ({
  intakeConversationMessagesQueries: { listByConversation: vi.fn().mockResolvedValue([]) },
}));

vi.mock('@/shared/queue/queue.manager', () => ({
  queueManager: { addIntakeEnrichmentJob: vi.fn() },
}));

vi.mock('@/shared/database/uow', () => ({
  uow: {
    transaction: vi.fn(async (fn: (ctx: { tx: unknown }) => unknown) => fn({ tx: {} })),
    afterCommit: vi.fn(async (callback: () => Promise<void> | void) => {
      await callback();
    }),
  },
}));

const repository = vi.mocked(practiceClientIntakesRepository);
const addJob = vi.mocked(queueManager.addIntakeEnrichmentJob);
const ORGANIZATION_ID = '10000000-0000-4000-8000-000000000001';
const OTHER_ORGANIZATION_ID = '10000000-0000-4000-8000-000000000002';
const INTAKE_ID = '10000000-0000-4000-8000-000000000003';

const makeIntake = (overrides: Partial<SelectPracticeClientIntake> = {}): SelectPracticeClientIntake => ({
  id: INTAKE_ID,
  organization_id: ORGANIZATION_ID,
  connected_account_id: null,
  practice_service_id: null,
  stripe_payment_link_id: null,
  stripe_payment_intent_id: null,
  stripe_charge_id: null,
  stripe_checkout_session_id: null,
  amount: 0,
  application_fee: null,
  currency: 'usd',
  status: 'succeeded',
  triage_status: 'pending_review',
  triage_reason: null,
  triage_decided_at: null,
  metadata: {
    email: 'client@example.com',
    name: 'Client',
    description: 'A lease dispute',
    practice_service_name: 'Landlord tenant',
  },
  address_id: null,
  conversation_id: null,
  client_ip: null,
  user_agent: null,
  urgency: 'time_sensitive',
  desired_outcome: 'Remain in the property',
  court_date: null,
  has_documents: true,
  income: null,
  household_size: null,
  case_strength: null,
  transcript_summary: null,
  enrichment_status: 'pending',
  enrichment_version: 1,
  enrichment_attempt_count: 0,
  enrichment_claim_token: null,
  enrichment_model: null,
  enrichment_error_code: null,
  enrichment_requested_at: new Date('2026-07-14T12:00:00.000Z'),
  enriched_at: null,
  jurisdiction_status: 'supported',
  jurisdiction_match: { country: 'US', state: 'IL' },
  succeeded_at: new Date('2026-07-14T12:00:00.000Z'),
  created_at: new Date('2026-07-14T11:00:00.000Z'),
  updated_at: new Date('2026-07-14T12:00:00.000Z'),
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  addJob.mockResolvedValue(undefined);
});

describe('intakeEnrichmentService.requestEnrichment', () => {
  it('versions and awaits a tenant-scoped enrichment job', async () => {
    repository.findById.mockResolvedValue(makeIntake());
    repository.requestEnrichment.mockResolvedValue(makeIntake({ enrichment_version: 2 }));

    await expect(
      intakeEnrichmentService.requestEnrichment({ intakeId: INTAKE_ID }, createSystemContext(ORGANIZATION_ID))
    ).resolves.toEqual({ intake_id: INTAKE_ID, enrichment_status: 'pending', enrichment_version: 2 });

    expect(repository.requestEnrichment).toHaveBeenCalledWith(INTAKE_ID, ORGANIZATION_ID);
    expect(addJob).toHaveBeenCalledWith({ intakeId: INTAKE_ID, organizationId: ORGANIZATION_ID, version: 2 });
  });

  it('rejects another organization before changing state', async () => {
    repository.findById.mockResolvedValue(makeIntake());

    await expect(
      intakeEnrichmentService.requestEnrichment({ intakeId: INTAKE_ID }, createSystemContext(OTHER_ORGANIZATION_ID))
    ).rejects.toMatchObject({ status: 403 });
    expect(repository.requestEnrichment).not.toHaveBeenCalled();
  });

  it('never enqueues a job when the version bump fails inside the transaction', async () => {
    repository.findById.mockResolvedValue(makeIntake());
    repository.requestEnrichment.mockResolvedValue(undefined);

    await expect(
      intakeEnrichmentService.requestEnrichment({ intakeId: INTAKE_ID }, createSystemContext(ORGANIZATION_ID))
    ).rejects.toMatchObject({ status: 404 });
    expect(addJob).not.toHaveBeenCalled();
  });
});

describe('intakeEnrichmentService.runEnrichmentJob', () => {
  it('persists strict output while preserving client-entered fields', async () => {
    const processing = makeIntake({
      enrichment_status: 'processing',
      enrichment_attempt_count: 1,
      enrichment_claim_token: 'claim-token-1',
    });
    const completed = makeIntake({ enrichment_status: 'succeeded', transcript_summary: 'Staff summary' });
    repository.claimEnrichment.mockResolvedValue(processing);
    repository.completeEnrichment.mockResolvedValue(completed);

    await expect(
      intakeEnrichmentService.runEnrichmentJob(
        { intakeId: INTAKE_ID, organizationId: ORGANIZATION_ID, version: 1 },
        vi
          .fn()
          .mockResolvedValue(
            JSON.stringify({ summary: 'Staff summary', urgency: 'routine', desired_outcome: 'AI outcome' })
          )
      )
    ).resolves.toBe('processed');

    expect(repository.completeEnrichment).toHaveBeenCalledWith(
      INTAKE_ID,
      ORGANIZATION_ID,
      1,
      'claim-token-1',
      expect.objectContaining({
        transcriptSummary: 'Staff summary',
        urgency: 'time_sensitive',
        desiredOutcome: 'Remain in the property',
      })
    );
  });

  it('persists a stable code and rethrows malformed output for Graphile retry', async () => {
    repository.claimEnrichment.mockResolvedValue(
      makeIntake({ enrichment_status: 'processing', enrichment_claim_token: 'claim-token-2' })
    );
    repository.failEnrichment.mockResolvedValue(true);

    await expect(
      intakeEnrichmentService.runEnrichmentJob(
        { intakeId: INTAKE_ID, organizationId: ORGANIZATION_ID, version: 1 },
        vi.fn().mockResolvedValue('not json')
      )
    ).rejects.toMatchObject({ status: 502 });
    expect(repository.failEnrichment).toHaveBeenCalledWith(
      INTAKE_ID,
      ORGANIZATION_ID,
      1,
      'claim-token-2',
      'malformed_response'
    );
    expect(repository.completeEnrichment).not.toHaveBeenCalled();
  });

  it('skips a stale version without calling the provider', async () => {
    const generateText = vi.fn();
    repository.claimEnrichment.mockResolvedValue(undefined);
    repository.findById.mockResolvedValue(makeIntake({ enrichment_version: 2 }));

    await expect(
      intakeEnrichmentService.runEnrichmentJob(
        { intakeId: INTAKE_ID, organizationId: ORGANIZATION_ID, version: 1 },
        generateText
      )
    ).resolves.toBe('skipped');
    expect(generateText).not.toHaveBeenCalled();
  });

  it('does not overwrite a newer version when an older provider attempt fails', async () => {
    repository.claimEnrichment.mockResolvedValue(makeIntake({ enrichment_status: 'processing' }));
    repository.failEnrichment.mockResolvedValue(false);

    await expect(
      intakeEnrichmentService.runEnrichmentJob(
        { intakeId: INTAKE_ID, organizationId: ORGANIZATION_ID, version: 1 },
        vi.fn().mockRejectedValue(new Error('provider unavailable'))
      )
    ).resolves.toBe('skipped');
  });
});
