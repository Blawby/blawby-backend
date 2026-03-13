import { getLogger } from '@logtape/logtape';
import type { Stripe } from 'stripe';
import { practiceClientIntakesRepository } from '@/modules/practice-client-intakes/database/queries/practice-client-intakes.repository';
import { practiceClientIntakesSchema } from '@/modules/practice-client-intakes/database/schema/practice-client-intakes.schema';
import type {
  PracticeClientIntakeMetadata,
  SelectPracticeClientIntake,
} from '@/modules/practice-client-intakes/database/schema/practice-client-intakes.schema';
import type { TriageStatus } from '@/modules/practice-client-intakes/types/practice-client-intakes.types';
import type { Result } from '@/shared/types/result';
import { result } from '@/shared/utils/result';
import { stripe } from '@/shared/utils/stripe-client';

const { practiceClientIntakeMetadataSchema } = practiceClientIntakesSchema;

export const logger = getLogger(['practice-client-intakes', 'service']);

export const normalizeTriageStatus = (value: string | null | undefined): TriageStatus => {
  if (value === 'accepted' || value === 'declined') {
    return value;
  }

  return 'pending_review';
};

export const parseMetadata = (rawMetadata: unknown): PracticeClientIntakeMetadata | null => {
  if (!rawMetadata) {
    return null;
  }

  try {
    return practiceClientIntakeMetadataSchema.parse(rawMetadata);
  } catch {
    return null;
  }
};

const getAuthorizedMetadata = (metadata: PracticeClientIntakeMetadata | null, isAuthorized: boolean) => {
  return isAuthorized && metadata
    ? {
        email: metadata.email,
        name: metadata.name,
        phone: metadata.phone ?? undefined,
        on_behalf_of: metadata.on_behalf_of ?? undefined,
        opposing_party: metadata.opposing_party ?? undefined,
        description: metadata.description ?? undefined,
      }
    : { email: '', name: '' };
};

const isAuthorizedIntakeView = (
  metadata: PracticeClientIntakeMetadata | null,
  requestingUserId?: string,
  isAdmin = false
) => {
  return isAdmin || Boolean(metadata?.user_id && metadata.user_id === requestingUserId);
};

const isUrgency = (value: string | null | undefined): value is 'routine' | 'time_sensitive' | 'emergency' => {
  return value === 'routine' || value === 'time_sensitive' || value === 'emergency';
};

export const formatIntakeListItem = (
  intake: SelectPracticeClientIntake,
  options?: { requestingUserId?: string; isAdmin?: boolean }
) => {
  const { requestingUserId, isAdmin = false } = options ?? {};
  const metadata = parseMetadata(intake.metadata);
  const isAuthorized = isAuthorizedIntakeView(metadata, requestingUserId, isAdmin);

  return {
    uuid: intake.id,
    organization_id: intake.organization_id,
    amount: intake.amount,
    currency: intake.currency,
    status: intake.status,
    triage_status: normalizeTriageStatus(intake.triage_status),
    triage_reason: intake.triage_reason ?? null,
    triage_decided_at: intake.triage_decided_at ?? null,
    conversation_id: isAuthorized ? (intake.conversation_id ?? null) : null,
    stripe_charge_id: intake.stripe_charge_id ?? null,
    metadata: getAuthorizedMetadata(metadata, isAuthorized),
    succeeded_at: intake.succeeded_at ?? null,
    created_at: intake.created_at,
    urgency: isUrgency(intake.urgency) ? intake.urgency : null,
    desired_outcome: intake.desired_outcome ?? null,
    court_date: intake.court_date ?? null,
    has_documents: intake.has_documents ?? null,
    income: intake.income ?? null,
    household_size: intake.household_size ?? null,
    case_strength: intake.case_strength ?? null,
  };
};

export const formatIntakeStatusResponse = (
  intake: SelectPracticeClientIntake,
  options?: { requestingUserId?: string; isAdmin?: boolean }
) => {
  const metadata = parseMetadata(intake.metadata);
  const isAuthorized = isAuthorizedIntakeView(metadata, options?.requestingUserId, options?.isAdmin);
  const formatted = formatIntakeListItem(intake, options);

  return {
    ...formatted,
    address_id: isAuthorized ? (intake.address_id ?? undefined) : undefined,
    conversation_id: formatted.conversation_id ?? undefined,
    stripe_charge_id: formatted.stripe_charge_id ?? undefined,
    urgency: formatted.urgency ?? undefined,
    desired_outcome: formatted.desired_outcome ?? undefined,
    has_documents: formatted.has_documents ?? undefined,
    case_strength: formatted.case_strength ?? undefined,
  };
};

export type ResolveCheckoutSessionResult = {
  intake?: Awaited<ReturnType<typeof practiceClientIntakesRepository.findById>>;
  session?: Stripe.Checkout.Session;
};

export const resolvePracticeClientIntakeByCheckoutSessionId = async (
  sessionId: string,
  options?: { requireSession?: boolean }
): Promise<Result<ResolveCheckoutSessionResult>> => {
  const { requireSession = false } = options ?? {};
  let intake: Awaited<ReturnType<typeof practiceClientIntakesRepository.findById>> | undefined =
    await practiceClientIntakesRepository.findByStripeCheckoutSessionId(sessionId);

  if (intake && !requireSession) {
    return result.ok({ intake });
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const intakeUuid =
      typeof session.metadata?.intake_uuid === 'string'
        ? session.metadata.intake_uuid
        : typeof session.client_reference_id === 'string'
          ? session.client_reference_id
          : undefined;

    if (!intakeUuid) {
      return result.ok({ session });
    }

    if (!intake) {
      intake = await practiceClientIntakesRepository.findById(intakeUuid);
    }

    if (intake && !intake.stripe_checkout_session_id) {
      await practiceClientIntakesRepository.update(intake.id, {
        stripe_checkout_session_id: session.id,
      });
    }

    return result.ok({ intake, session });
  } catch (error) {
    logger.error('Failed to resolve checkout session {sessionId}', {
      sessionId,
      error,
    });
    return result.internalError('Failed to resolve checkout session');
  }
};

export const parseValidDate = (value: string): Date | null => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};
