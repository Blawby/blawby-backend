import { conflictCheckService } from '@/modules/practice/services/conflict-check.service';
import { findPracticeDetailsByOrganization } from '@/modules/practice/database/queries/practice-details.repository';
import { intakePreflightQueries } from '@/modules/practice-client-intakes/database/queries/intake-preflight.queries';
import { getStaffAccessibleIntake } from '@/modules/practice-client-intakes/services/intake-access.helpers';
import { intakeSharedHelpers } from '@/modules/practice-client-intakes/services/intake-shared.helpers';
import type {
  IntakePreflightCheck,
  IntakePreflightResponse,
} from '@/modules/practice-client-intakes/types/intake-preflight.types';
import type { ConflictCheckResult } from '@/modules/practice/types/conflict-check.types';
import { uploadsRepository } from '@/shared/uploads/queries/uploads.repository';
import type { ServiceContext } from '@/shared/types/service-context';
import { HTTPException } from 'hono/http-exception';

interface SupportedJurisdiction {
  country: string;
  states?: string[];
}

interface OfferedService {
  id: string;
  name: string;
  key: string;
}

interface RoutingProfileSource {
  user_id: string;
  practice_areas: string[];
  max_capacity: number | null;
  accepting_clients: boolean;
}

interface ActiveMatterAssignmentSource {
  matter_id: string;
  responsible_attorney_id: string | null;
  assignee_user_id: string | null;
}

const normalize = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const deriveConflictCheck = (result: ConflictCheckResult): IntakePreflightCheck => ({
  key: 'conflict',
  status: result.status === 'clear' ? 'pass' : 'review',
  summary: result.suggested_next_action,
  evidence: [
    `${result.conflicting_matters.length} matching matter(s)`,
    `${result.conflicting_contacts.length} matching contact(s)`,
  ],
});

const deriveJurisdictionCheck = ({
  persistedStatus,
  matchedLocation,
  intakeLocation,
  supported,
}: {
  persistedStatus: 'supported' | 'unsupported' | 'unknown' | 'review_required' | null;
  matchedLocation: { country?: string; state?: string } | null;
  intakeLocation: { country?: string; state?: string } | null;
  supported: readonly SupportedJurisdiction[];
}): IntakePreflightCheck => {
  const location = matchedLocation ?? intakeLocation;
  const country = location?.country?.toUpperCase();
  const state = location?.state?.toUpperCase();
  const locationEvidence = country ? `${country}${state ? `-${state}` : ''}` : 'no intake jurisdiction recorded';

  if (persistedStatus) {
    return {
      key: 'jurisdiction',
      status: persistedStatus === 'supported' ? 'pass' : 'review',
      summary: `Stored jurisdiction result is ${persistedStatus.replace('_', ' ')}.`,
      evidence: [locationEvidence, 'persisted intake jurisdiction result'],
    };
  }

  if (supported.length === 0) {
    return {
      key: 'jurisdiction',
      status: 'not_available',
      summary: 'Practice jurisdiction coverage is not configured.',
      evidence: [locationEvidence],
    };
  }

  if (!country) {
    return {
      key: 'jurisdiction',
      status: 'review',
      summary: 'Intake location is incomplete.',
      evidence: [locationEvidence],
    };
  }

  const countryCoverage = supported.find((entry) => entry.country.toUpperCase() === country);
  if (!countryCoverage) {
    return {
      key: 'jurisdiction',
      status: 'review',
      summary: `Practice does not list ${country} as a supported country.`,
      evidence: [locationEvidence],
    };
  }

  if (!countryCoverage.states || countryCoverage.states.length === 0) {
    return {
      key: 'jurisdiction',
      status: 'pass',
      summary: `Practice supports intakes from ${country}.`,
      evidence: [locationEvidence],
    };
  }

  if (!state) {
    return {
      key: 'jurisdiction',
      status: 'review',
      summary: `State or province is required to confirm ${country} coverage.`,
      evidence: [locationEvidence],
    };
  }

  const stateSupported = countryCoverage.states.some((value) => value.toUpperCase() === state);
  return {
    key: 'jurisdiction',
    status: stateSupported ? 'pass' : 'review',
    summary: stateSupported
      ? `Practice supports intakes from ${country}-${state}.`
      : `Practice does not list ${country}-${state} as supported.`,
    evidence: [locationEvidence],
  };
};

const derivePracticeFitCheck = ({
  requestedServiceId,
  requestedServiceName,
  offeredServices,
}: {
  requestedServiceId: string | null;
  requestedServiceName: string | null;
  offeredServices: readonly OfferedService[];
}): { check: IntakePreflightCheck; service: OfferedService | null } => {
  let service: OfferedService | null = null;
  if (requestedServiceId) {
    service = offeredServices.find((item) => item.id === requestedServiceId) ?? null;
  } else if (requestedServiceName) {
    service = offeredServices.find((item) => normalize(item.name) === normalize(requestedServiceName)) ?? null;
  }

  if (service) {
    return {
      service,
      check: {
        key: 'practice-fit',
        status: 'pass',
        summary: `${service.name} is an offered practice service.`,
        evidence: [service.key],
      },
    };
  }

  if (requestedServiceId || requestedServiceName) {
    return {
      service: null,
      check: {
        key: 'practice-fit',
        status: 'review',
        summary: 'The requested service is not in this practice service catalog.',
        evidence: [requestedServiceName ?? requestedServiceId ?? 'unknown service'],
      },
    };
  }

  return {
    service: null,
    check: {
      key: 'practice-fit',
      status: 'review',
      summary: 'No practice service was selected for this intake.',
      evidence: [],
    },
  };
};

const buildActiveMatterCounts = (assignments: readonly ActiveMatterAssignmentSource[]): ReadonlyMap<string, number> => {
  const mattersByUser = new Map<string, Set<string>>();
  for (const assignment of assignments) {
    const userIds = [assignment.responsible_attorney_id, assignment.assignee_user_id].filter(
      (userId): userId is string => Boolean(userId)
    );
    for (const userId of userIds) {
      const matterIds = mattersByUser.get(userId) ?? new Set<string>();
      matterIds.add(assignment.matter_id);
      mattersByUser.set(userId, matterIds);
    }
  }
  return new Map([...mattersByUser].map(([userId, matterIds]) => [userId, matterIds.size]));
};

const deriveCapacityCheck = ({
  service,
  profiles,
  assignments,
}: {
  service: OfferedService | null;
  profiles: readonly RoutingProfileSource[];
  assignments: readonly ActiveMatterAssignmentSource[];
}): IntakePreflightCheck => {
  if (!service) {
    return {
      key: 'capacity',
      status: 'review',
      summary: 'Capacity cannot be routed until a practice service is selected.',
      evidence: [],
    };
  }

  if (profiles.length === 0) {
    return {
      key: 'capacity',
      status: 'not_available',
      summary: 'Attorney routing profiles are not configured.',
      evidence: [],
    };
  }

  const serviceTerms = new Set([normalize(service.name), normalize(service.key)]);
  const matchingProfiles = profiles.filter((profile) =>
    profile.practice_areas.some((area) => serviceTerms.has(normalize(area)))
  );
  if (matchingProfiles.length === 0) {
    return {
      key: 'capacity',
      status: 'review',
      summary: `No routing profile explicitly covers ${service.name}.`,
      evidence: [`${profiles.length} configured routing profile(s)`],
    };
  }

  const activeMatterCounts = buildActiveMatterCounts(assignments);
  const availableProfiles = matchingProfiles.filter((profile) => {
    const currentMatters = activeMatterCounts.get(profile.user_id) ?? 0;
    return profile.accepting_clients && (profile.max_capacity === null || currentMatters < profile.max_capacity);
  });

  return {
    key: 'capacity',
    status: availableProfiles.length > 0 ? 'pass' : 'review',
    summary:
      availableProfiles.length > 0
        ? `${availableProfiles.length} matching attorney(s) have capacity.`
        : 'Matching attorneys are not accepting clients or are at capacity.',
    evidence: [
      `${matchingProfiles.length} matching routing profile(s)`,
      `${availableProfiles.length} currently available`,
    ],
  };
};

const deriveDocumentCheck = (hasDocuments: boolean | null, verifiedDocumentCount: number): IntakePreflightCheck => {
  if (verifiedDocumentCount > 0) {
    return {
      key: 'documents',
      status: 'pass',
      summary: `${verifiedDocumentCount} verified intake document(s) are attached.`,
      evidence: [hasDocuments === true ? 'client reported having documents' : 'verified upload is present'],
    };
  }

  if (hasDocuments === false) {
    return {
      key: 'documents',
      status: 'pass',
      summary: 'Client reported having no documents to provide.',
      evidence: ['0 verified intake documents'],
    };
  }

  return {
    key: 'documents',
    status: 'review',
    summary:
      hasDocuments === true
        ? 'Client reported having documents, but no verified upload is attached.'
        : 'Document availability was not answered.',
    evidence: ['0 verified intake documents'],
  };
};

const deriveIdentityCheck = ({
  hasName,
  hasEmail,
  hasPhone,
  hasAddress,
}: {
  hasName: boolean;
  hasEmail: boolean;
  hasPhone: boolean;
  hasAddress: boolean;
}): IntakePreflightCheck => ({
  key: 'identity-verification',
  status: 'not_available',
  summary: 'Identity fields can be reviewed, but no KYC verification provider or result exists.',
  evidence: [
    `name ${hasName ? 'present' : 'missing'}`,
    `email ${hasEmail ? 'present' : 'missing'}`,
    `phone ${hasPhone ? 'present' : 'missing'}`,
    `address ${hasAddress ? 'present' : 'missing'}`,
  ],
});

const deriveOverallStatus = (checks: readonly IntakePreflightCheck[]): IntakePreflightResponse['overall_status'] => {
  if (checks.some((check) => check.status === 'block')) {
    return 'blocked';
  }
  if (checks.some((check) => check.status === 'review')) {
    return 'review';
  }
  return checks.some((check) => check.status === 'pass') ? 'ready' : 'review';
};

const getPreflight = async (
  { intakeId }: { intakeId: string },
  ctx: ServiceContext
): Promise<IntakePreflightResponse> => {
  const intake = await getStaffAccessibleIntake(intakeId, ctx, 'read');
  const metadata = intakeSharedHelpers.parseMetadata(intake.metadata);
  if (!metadata) {
    throw new HTTPException(422, { message: 'Intake metadata is missing or malformed' });
  }

  const [practiceDetails, profiles, assignments, verifiedDocumentCount, conflictResult] = await Promise.all([
    findPracticeDetailsByOrganization(ctx.organizationId),
    intakePreflightQueries.listRoutingProfiles(ctx.organizationId),
    intakePreflightQueries.listActiveMatterAssignments(ctx.organizationId),
    uploadsRepository.countByOrganization(ctx.organizationId, {
      scopeType: 'intake',
      scopeId: intake.id,
      status: 'verified',
    }),
    conflictCheckService.runConflictCheck(
      {
        data: {
          name: metadata.name,
          opposing_party: metadata.opposing_party,
        },
      },
      ctx
    ),
  ]);

  const offeredServices = practiceDetails?.services ?? [];
  const { check: practiceFitCheck, service } = derivePracticeFitCheck({
    requestedServiceId: intake.practice_service_id,
    requestedServiceName: metadata.practice_service_name ?? null,
    offeredServices,
  });
  const address = metadata.address ?? null;
  const checks: IntakePreflightCheck[] = [
    deriveConflictCheck(conflictResult),
    deriveJurisdictionCheck({
      persistedStatus: intake.jurisdiction_status,
      matchedLocation: intake.jurisdiction_match,
      intakeLocation: address ? { country: address.country, state: address.state } : null,
      supported: practiceDetails?.supported_states ?? [],
    }),
    practiceFitCheck,
    deriveCapacityCheck({ service, profiles, assignments }),
    deriveDocumentCheck(intake.has_documents, verifiedDocumentCount),
    deriveIdentityCheck({
      hasName: metadata.name.trim().length > 0,
      hasEmail: metadata.email.trim().length > 0,
      hasPhone: Boolean(metadata.phone?.trim()),
      hasAddress: Boolean(address?.line1 && address.city && address.state && address.postal_code && address.country),
    }),
  ];

  return {
    intake_id: intake.id,
    overall_status: deriveOverallStatus(checks),
    generated_at: new Date().toISOString(),
    checks,
  };
};

export const intakePreflightService = { getPreflight };

export {
  buildActiveMatterCounts,
  deriveCapacityCheck,
  deriveConflictCheck,
  deriveDocumentCheck,
  deriveIdentityCheck,
  deriveJurisdictionCheck,
  deriveOverallStatus,
  derivePracticeFitCheck,
};
