import {
  buildActiveMatterCounts,
  deriveCapacityCheck,
  deriveConflictCheck,
  deriveDocumentCheck,
  deriveIdentityCheck,
  deriveJurisdictionCheck,
  deriveOverallStatus,
  derivePracticeFitCheck,
} from '@/modules/practice-client-intakes/services/intake-preflight.service';
import { describe, expect, it } from 'vitest';

const service = { id: 'service-1', name: 'Family Law', key: 'family-law' };

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
