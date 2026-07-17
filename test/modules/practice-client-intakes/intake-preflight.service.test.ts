// oxlint-disable typescript/no-unsafe-type-assertion
import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createServiceContext } from './helpers/intake';
import type {
  InsertPracticeClientIntake,
  SelectPracticeClientIntake,
} from '@/modules/practice-client-intakes/database/schema/practice-client-intakes.schema';
import type { PracticeDetails, PracticeService } from '@/modules/practice/database/schema/practice.schema';
import type { ConflictCheckResult } from '@/modules/practice/types/conflict-check.types';

vi.mock('@/modules/practice-client-intakes/services/intake-access.helpers', () => ({
  getStaffAccessibleIntake: vi.fn(),
}));
vi.mock('@/modules/practice/database/queries/practice-details.repository', () => ({
  findPracticeDetailsByOrganization: vi.fn(),
}));
vi.mock('@/modules/practice-client-intakes/database/queries/intake-preflight.queries', () => ({
  intakePreflightQueries: {
    listRoutingProfiles: vi.fn(),
    listActiveMatterAssignments: vi.fn(),
  },
}));
vi.mock('@/shared/uploads/queries/uploads.repository', () => ({
  uploadsRepository: {
    countByOrganization: vi.fn(),
  },
}));
vi.mock('@/modules/practice/services/conflict-check.service', () => ({
  conflictCheckService: {
    runConflictCheck: vi.fn(),
  },
}));

import {
  buildActiveMatterCounts,
  deriveCapacityCheck,
  deriveConflictCheck,
  deriveDocumentCheck,
  deriveIdentityCheck,
  deriveJurisdictionCheck,
  deriveOverallStatus,
  derivePracticeFitCheck,
  intakePreflightService,
} from '@/modules/practice-client-intakes/services/intake-preflight.service';
import { getStaffAccessibleIntake } from '@/modules/practice-client-intakes/services/intake-access.helpers';
import { findPracticeDetailsByOrganization } from '@/modules/practice/database/queries/practice-details.repository';
import { intakePreflightQueries } from '@/modules/practice-client-intakes/database/queries/intake-preflight.queries';
import { uploadsRepository } from '@/shared/uploads/queries/uploads.repository';
import { conflictCheckService } from '@/modules/practice/services/conflict-check.service';

const service = { id: 'service-1', name: 'Family Law', key: 'family-law' };

const orgId = randomUUID();

const buildIntake = (overrides: Partial<InsertPracticeClientIntake> = {}): SelectPracticeClientIntake => {
  const now = new Date();
  return {
    id: randomUUID(),
    organization_id: orgId,
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
    metadata: { email: 'client@example.com', name: 'Jane Client' },
    address_id: null,
    conversation_id: null,
    client_ip: null,
    user_agent: null,
    urgency: null,
    desired_outcome: null,
    court_date: null,
    has_documents: null,
    income: null,
    household_size: null,
    case_strength: null,
    transcript_summary: null,
    jurisdiction_status: null,
    jurisdiction_match: null,
    succeeded_at: null,
    created_at: now,
    updated_at: now,
    ...overrides,
  } as unknown as SelectPracticeClientIntake;
};

const buildPracticeDetails = (
  overrides: Partial<PracticeDetails> & { services?: PracticeService[]; supported_states?: unknown[] } = {}
) => {
  const now = new Date();
  return {
    id: randomUUID(),
    organization_id: orgId,
    user_id: randomUUID(),
    address_id: null,
    business_phone: null,
    business_email: null,
    website: null,
    consultation_fee: null,
    payment_url: null,
    calendly_url: null,
    intro_message: null,
    overview: null,
    accent_color: null,
    is_public: false,
    billing_increment_minutes: 1,
    created_at: now,
    updated_at: now,
    supported_states: [],
    services: [],
    ...overrides,
  } as unknown as PracticeDetails & { services: PracticeService[] };
};

const clearConflictResult: ConflictCheckResult = {
  status: 'clear',
  conflicting_matters: [],
  conflicting_contacts: [],
  warnings: [],
  suggested_next_action: 'No conflicts found.',
};

describe('intake preflight rules', () => {
  it('flags a likely conflict for staff review and exposes match counts', () => {
    const check = deriveConflictCheck({
      status: 'conflicted',
      conflicting_matters: [
        { matter_id: 'matter-1', title: 'Existing', similarity_score: 0.9, match_field: 'opposing_party' },
      ],
      conflicting_contacts: [],
      warnings: [],
      suggested_next_action: 'Do not proceed without attorney review.',
    });

    expect(check).toEqual({
      key: 'conflict',
      status: 'review',
      summary: 'Do not proceed without attorney review.',
      evidence: ['1 matching matter(s)', '0 matching contact(s)'],
    });
  });

  it('passes configured jurisdiction and flags unsupported locations for review', () => {
    const supported = [{ country: 'US', states: ['NC', 'SC'] }];
    expect(
      deriveJurisdictionCheck({
        persistedStatus: null,
        matchedLocation: null,
        intakeLocation: { country: 'us', state: 'nc' },
        supported,
      })
    ).toMatchObject({ status: 'pass' });
    expect(
      deriveJurisdictionCheck({
        persistedStatus: null,
        matchedLocation: null,
        intakeLocation: { country: 'US', state: 'VA' },
        supported,
      })
    ).toMatchObject({ status: 'review' });
    expect(
      deriveJurisdictionCheck({
        persistedStatus: 'unsupported',
        matchedLocation: { country: 'US', state: 'VA' },
        intakeLocation: null,
        supported,
      })
    ).toMatchObject({ status: 'review' });
  });

  it('matches practice services and treats catalog or capacity mismatches as advisory', () => {
    const fit = derivePracticeFitCheck({
      requestedServiceId: service.id,
      requestedServiceName: null,
      offeredServices: [service],
    });
    const assignments = [
      { matter_id: 'matter-1', responsible_attorney_id: 'user-1', assignee_user_id: 'user-1' },
      { matter_id: 'matter-2', responsible_attorney_id: 'user-1', assignee_user_id: null },
    ];

    expect(buildActiveMatterCounts(assignments).get('user-1')).toBe(2);
    expect(
      derivePracticeFitCheck({
        requestedServiceId: 'unlisted-service',
        requestedServiceName: null,
        offeredServices: [service],
      }).check
    ).toMatchObject({ status: 'review' });
    expect(
      deriveCapacityCheck({
        service: fit.service,
        profiles: [
          {
            user_id: 'user-1',
            practice_areas: ['Family Law'],
            max_capacity: 3,
            accepting_clients: true,
          },
        ],
        assignments,
      })
    ).toMatchObject({ status: 'pass' });
    expect(
      deriveCapacityCheck({
        service: fit.service,
        profiles: [
          {
            user_id: 'user-1',
            practice_areas: ['Family Law'],
            max_capacity: 2,
            accepting_clients: true,
          },
        ],
        assignments,
      })
    ).toMatchObject({ status: 'review' });
  });

  it('passes when documents are verified or not reported and reviews unresolved document claims', () => {
    expect(deriveDocumentCheck(true, 1)).toMatchObject({ status: 'pass' });
    expect(deriveDocumentCheck(true, 0)).toMatchObject({ status: 'review' });
    expect(deriveDocumentCheck(false, 0)).toMatchObject({ status: 'pass' });
    expect(deriveDocumentCheck(null, 0)).toMatchObject({ status: 'review' });
  });

  it('ignores unavailable checks when deriving readiness but retains explicit review and block states', () => {
    const identity = deriveIdentityCheck({ hasName: true, hasEmail: true, hasPhone: true, hasAddress: true });
    expect(identity).toMatchObject({ status: 'not_available' });
    expect(deriveOverallStatus([deriveDocumentCheck(true, 1), identity])).toBe('ready');
    expect(deriveOverallStatus([identity])).toBe('review');
    expect(deriveOverallStatus([deriveDocumentCheck(null, 0), identity])).toBe('review');
    expect(
      deriveOverallStatus([
        {
          key: 'conflict',
          status: 'block',
          summary: 'A confirmed blocking decision exists.',
          evidence: [],
        },
        identity,
      ])
    ).toBe('blocked');
  });
});

describe('intake preflight orchestration', () => {
  const ctx = createServiceContext(randomUUID(), orgId);

  beforeEach(() => {
    vi.mocked(getStaffAccessibleIntake).mockReset();
    vi.mocked(findPracticeDetailsByOrganization).mockReset();
    vi.mocked(intakePreflightQueries.listRoutingProfiles).mockReset();
    vi.mocked(intakePreflightQueries.listActiveMatterAssignments).mockReset();
    vi.mocked(uploadsRepository.countByOrganization).mockReset();
    vi.mocked(conflictCheckService.runConflictCheck).mockReset();
  });

  it('fails fast on malformed metadata without querying any dependency', async () => {
    const intake = buildIntake({ metadata: { name: 'Missing Email' } as unknown as InsertPracticeClientIntake['metadata'] });
    vi.mocked(getStaffAccessibleIntake).mockResolvedValue(intake);

    await expect(intakePreflightService.getPreflight({ intakeId: intake.id }, ctx)).rejects.toMatchObject({
      status: 422,
      message: 'Intake metadata is missing or malformed',
    });

    expect(findPracticeDetailsByOrganization).not.toHaveBeenCalled();
    expect(intakePreflightQueries.listRoutingProfiles).not.toHaveBeenCalled();
    expect(intakePreflightQueries.listActiveMatterAssignments).not.toHaveBeenCalled();
    expect(uploadsRepository.countByOrganization).not.toHaveBeenCalled();
    expect(conflictCheckService.runConflictCheck).not.toHaveBeenCalled();
  });

  it('scopes every dependency query to the intake organization', async () => {
    const intake = buildIntake({
      practice_service_id: service.id,
      metadata: { email: 'client@example.com', name: 'Jane Client', opposing_party: 'Acme Corp' },
    });
    vi.mocked(getStaffAccessibleIntake).mockResolvedValue(intake);
    vi.mocked(findPracticeDetailsByOrganization).mockResolvedValue(buildPracticeDetails());
    vi.mocked(intakePreflightQueries.listRoutingProfiles).mockResolvedValue([]);
    vi.mocked(intakePreflightQueries.listActiveMatterAssignments).mockResolvedValue([]);
    vi.mocked(uploadsRepository.countByOrganization).mockResolvedValue(0);
    vi.mocked(conflictCheckService.runConflictCheck).mockResolvedValue(clearConflictResult);

    await intakePreflightService.getPreflight({ intakeId: intake.id }, ctx);

    expect(findPracticeDetailsByOrganization).toHaveBeenCalledWith(orgId);
    expect(intakePreflightQueries.listRoutingProfiles).toHaveBeenCalledWith(orgId);
    expect(intakePreflightQueries.listActiveMatterAssignments).toHaveBeenCalledWith(orgId);
    expect(uploadsRepository.countByOrganization).toHaveBeenCalledWith(orgId, {
      scopeType: 'intake',
      scopeId: intake.id,
      status: 'verified',
    });
    expect(conflictCheckService.runConflictCheck).toHaveBeenCalledWith(
      { data: { name: 'Jane Client', opposing_party: 'Acme Corp' } },
      ctx
    );
  });

  it('assembles the full six-check advisory response', async () => {
    const intake = buildIntake({
      practice_service_id: service.id,
      has_documents: true,
      jurisdiction_status: null,
      jurisdiction_match: null,
      metadata: {
        email: 'client@example.com',
        name: 'Jane Client',
        phone: '+15555550100',
        address: {
          line1: '1 Main St',
          city: 'Charlotte',
          state: 'NC',
          postal_code: '28202',
          country: 'US',
        },
      },
    });
    vi.mocked(getStaffAccessibleIntake).mockResolvedValue(intake);
    vi.mocked(findPracticeDetailsByOrganization).mockResolvedValue(
      buildPracticeDetails({ services: [service], supported_states: [{ country: 'US', states: ['NC'] }] })
    );
    vi.mocked(intakePreflightQueries.listRoutingProfiles).mockResolvedValue([
      { user_id: 'user-1', practice_areas: ['Family Law'], max_capacity: 3, accepting_clients: true },
    ]);
    vi.mocked(intakePreflightQueries.listActiveMatterAssignments).mockResolvedValue([]);
    vi.mocked(uploadsRepository.countByOrganization).mockResolvedValue(1);
    vi.mocked(conflictCheckService.runConflictCheck).mockResolvedValue(clearConflictResult);

    const response = await intakePreflightService.getPreflight({ intakeId: intake.id }, ctx);

    expect(response.intake_id).toBe(intake.id);
    expect(response.overall_status).toBe('ready');
    expect(new Date(response.generated_at).toString()).not.toBe('Invalid Date');
    expect(response.checks.map((check) => check.key)).toEqual([
      'conflict',
      'jurisdiction',
      'practice-fit',
      'capacity',
      'documents',
      'identity-verification',
    ]);
    expect(response.checks.map((check) => check.status)).toEqual([
      'pass',
      'pass',
      'pass',
      'pass',
      'pass',
      'not_available',
    ]);
  });
});
