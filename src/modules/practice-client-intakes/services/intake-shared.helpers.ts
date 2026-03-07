import { getLogger } from '@logtape/logtape';

import type { MatterResponse } from '@/modules/matters/types/matter.types';
import { practiceClientIntakesRepository } from '@/modules/practice-client-intakes/database/queries/practice-client-intakes.repository';
import type { SelectPracticeClientIntake, PracticeClientIntakeMetadata } from '@/modules/practice-client-intakes/database/schema/practice-client-intakes.schema';
import { practiceClientIntakesSchema } from '@/modules/practice-client-intakes/database/schema/practice-client-intakes.schema';
import { retrieveCheckoutSession } from '@/modules/practice-client-intakes/services/intake-stripe.helpers';
import type { TriageStatus } from '@/modules/practice-client-intakes/types/practice-client-intakes.types';

const { practiceClientIntakeMetadataSchema } = practiceClientIntakesSchema;
const logger = getLogger(['practice-client-intakes', 'helpers', 'shared']);

export const normalizeTriageStatus = (value: string | null | undefined): TriageStatus => {
  if (value === 'accepted' || value === 'declined') {
    return value;
  }
  return 'pending_review';
};

export const parseMetadata = (rawMetadata: unknown): PracticeClientIntakeMetadata | null => {
  if (!rawMetadata) return null;
  try {
    return practiceClientIntakeMetadataSchema.parse(rawMetadata);
  } catch {
    return null;
  }
};

export const formatIntakeResponse = (
  intake: SelectPracticeClientIntake,
  options?: { requestingUserId?: string; isAdmin?: boolean },
) => {
  const { requestingUserId, isAdmin = false } = options ?? {};
  const metadata = parseMetadata(intake.metadata);
  const isAuthorized = isAdmin || (metadata?.user_id && requestingUserId
    ? metadata.user_id === requestingUserId
    : false);

  return {
    uuid: intake.id,
    organization_id: intake.organization_id,
    amount: intake.amount,
    currency: intake.currency,
    status: intake.status,
    triage_status: normalizeTriageStatus(intake.triage_status),
    triage_reason: intake.triage_reason ?? null,
    triage_decided_at: intake.triage_decided_at ?? null,
    address_id: isAuthorized ? intake.address_id ?? undefined : undefined,
    conversation_id: isAuthorized ? intake.conversation_id ?? undefined : undefined,
    stripe_charge_id: intake.stripe_charge_id ?? undefined,
    metadata: isAuthorized && metadata
      ? {
        email: metadata.email,
        name: metadata.name,
        phone: metadata.phone ?? undefined,
        on_behalf_of: metadata.on_behalf_of ?? undefined,
        opposing_party: metadata.opposing_party ?? undefined,
        description: metadata.description ?? undefined,
      }
      : { email: '', name: '' },
    succeeded_at: intake.succeeded_at ?? null,
    created_at: intake.created_at,
    urgency: (intake.urgency === 'routine' || intake.urgency === 'time_sensitive' || intake.urgency === 'emergency'
      ? intake.urgency as 'routine' | 'time_sensitive' | 'emergency'
      : undefined),
    desired_outcome: intake.desired_outcome ?? undefined,
    court_date: intake.court_date ?? null,
    has_documents: intake.has_documents ?? undefined,
    income: intake.income ?? null,
    household_size: intake.household_size ?? null,
    case_strength: intake.case_strength ?? undefined,
  };
};

export type ResolveCheckoutSessionResult = {
  intake?: Awaited<ReturnType<typeof practiceClientIntakesRepository.findById>>;
  session?: Awaited<ReturnType<typeof retrieveCheckoutSession>>;
};

export const resolvePracticeClientIntakeByCheckoutSessionId = async (
  sessionId: string,
  options?: { requireSession?: boolean },
): Promise<ResolveCheckoutSessionResult> => {
  const { requireSession = false } = options ?? {};
  let intake: Awaited<ReturnType<typeof practiceClientIntakesRepository.findById>> | undefined
    = await practiceClientIntakesRepository.findByStripeCheckoutSessionId(sessionId);

  if (intake && !requireSession) {
    return { intake };
  }

  try {
    const session = await retrieveCheckoutSession(sessionId);
    const intakeUuid: string | undefined = typeof session.metadata?.intake_uuid === 'string'
      ? session.metadata.intake_uuid
      : (typeof session.client_reference_id === 'string' ? session.client_reference_id : undefined);

    if (!intakeUuid) {
      return { session };
    }

    if (!intake) {
      intake = await practiceClientIntakesRepository.findById(intakeUuid);
    }

    if (intake && !intake.stripe_checkout_session_id) {
      await practiceClientIntakesRepository.update(intake.id, {
        stripe_checkout_session_id: session.id,
      });
    }

    return { intake, session };
  } catch (error) {
    logger.error('Failed to resolve checkout session {sessionId} in resolvePracticeClientIntakeByCheckoutSessionId', {
      sessionId,
      error,
    });
    throw error;
  }
};

export const resolveMatterStatus = (s: string): MatterResponse['status'] => {
  const statuses: Record<string, MatterResponse['status']> = {
    declined: 'declined',
    first_contact: 'first_contact',
    intake_pending: 'intake_pending',
    conflict_check: 'conflict_check',
    conflicted: 'conflicted',
    eligibility: 'eligibility',
    referred: 'referred',
    consultation_scheduled: 'consultation_scheduled',
    engagement_pending: 'engagement_pending',
    active: 'active',
    closed: 'closed',
  };
  return statuses[s] ?? 'engagement_pending';
};

export const resolvePaymentFrequency = (f: string | null): 'project' | 'milestone' | null => {
  if (f === 'project') return 'project';
  if (f === 'milestone') return 'milestone';
  return null;
};

export const resolveMatterUrgency = (u: string | null): 'routine' | 'time_sensitive' | 'emergency' | null => {
  if (u === 'routine') return 'routine';
  if (u === 'time_sensitive') return 'time_sensitive';
  if (u === 'emergency') return 'emergency';
  return null;
};
