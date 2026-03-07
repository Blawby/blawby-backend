import { ForbiddenError } from '@casl/ability';
import { getLogger } from '@logtape/logtape';

import { onboardingRepository } from '@/modules/onboarding/database/queries/onboarding.repository';
import { isAccountActive } from '@/modules/onboarding/services/connected-accounts.service';
import { organizationRepository } from '@/modules/practice/database/queries/organization.repository';
import { practiceClientIntakesRepository } from '@/modules/practice-client-intakes/database/queries/practice-client-intakes.repository';
import {
  formatIntakeResponse,
  normalizeTriageStatus,
} from '@/modules/practice-client-intakes/services/intake-shared.helpers';
import type {
  IntakeSettingsResponse as PracticeClientIntakeSettings,
  ListIntakeItem,
  TriageStatus,
  UpdateIntakeTriageStatusRequest,
} from '@/modules/practice-client-intakes/types/practice-client-intakes.types';
import type { Result, PaginatedResultWithMeta } from '@/shared/types/result';
import type { ServiceContext } from '@/shared/types/service-context';
import { result } from '@/shared/utils/result';

const logger = getLogger(['practice-client-intakes', 'service', 'query']);

const parseValidDate = (value: string): Date | null => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

/**
 * Get practice client intake settings by slug
 */
const getPracticeClientIntakeSettings = async (
  params: { slug: string },
  _ctx: ServiceContext,
): Promise<Result<PracticeClientIntakeSettings>> => {
  const { slug } = params;
  try {
    const organization = await organizationRepository.findBySlug(slug);

    if (!organization) {
      return result.notFound(`Organization with slug '${slug}' not found`);
    }

    if (!organization.activeSubscriptionId) {
      return result.forbidden('Organization does not have an active subscription');
    }

    const connectedAccount = await onboardingRepository.findByOrganizationId(organization.id);

    if (!connectedAccount) {
      return result.forbidden('Organization does not have a connected Stripe account');
    }

    if (!(await isAccountActive(connectedAccount))) {
      return result.forbidden('Connected account is not ready to accept payments');
    }

    return result.ok({
      success: true,
      data: {
        organization: {
          id: organization.id,
          name: organization.name,
          slug: organization.slug,
          logo: organization.logo ?? undefined,
        },
        settings: {
          payment_link_enabled: organization?.paymentLinkEnabled ?? false,
          prefill_amount: organization?.paymentLinkPrefillAmount ?? 0,
        },
        connected_account: {
          id: connectedAccount.id,
          charges_enabled: connectedAccount.charges_enabled,
        },
      },
    });
  } catch (error) {
    logger.error('Failed to get organization intake settings for {slug}: {error}', { error, slug });
    return result.internalError('Failed to get organization intake settings');
  }
};

/**
 * List practice client intakes with filtering and pagination
 */
const listIntakes = async (
  params: {
    practiceId: string;
    query: {
      status?: string;
      page: number;
      limit: number;
      search?: string;
      from?: string;
      to?: string;
      intake_id?: string;
    };
  },
  ctx: ServiceContext,
): Promise<PaginatedResultWithMeta<ListIntakeItem, 'intakes'>> => {
  const { practiceId, query } = params;
  ForbiddenError.from(ctx.ability).throwUnlessCan('read', 'Organization');

  try {
    if (query.from && !parseValidDate(query.from)) {
      return result.badRequest('Invalid date: from');
    }
    if (query.to && !parseValidDate(query.to)) {
      return result.badRequest('Invalid date: to');
    }

    const { intakes, total } = await practiceClientIntakesRepository.findByOrganizationId({
      organizationId: practiceId,
      ...query,
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
      intakeId: query.intake_id,
    });

    const total_pages = Math.ceil(total / query.limit);

    const formattedIntakes = intakes.map((intake) => {
      const formatted = formatIntakeResponse(intake, { isAdmin: true });
      return {
        ...formatted,
        conversation_id: formatted.conversation_id ?? null,
        stripe_charge_id: formatted.stripe_charge_id ?? null,
        urgency: formatted.urgency ?? null,
        desired_outcome: formatted.desired_outcome ?? null,
        has_documents: formatted.has_documents ?? null,
        case_strength: formatted.case_strength ?? null,
      };
    });

    return result.ok({
      intakes: formattedIntakes,
      total,
      page: query.page,
      limit: query.limit,
      total_pages,
    });
  } catch (error) {
    logger.error('Failed to list intakes for organization {organizationId}: {error}', {
      organizationId: practiceId,
      error,
    });
    return result.internalError('Failed to list intakes');
  }
};

/**
 * Update intake triage status
 */
const updateIntakeTriageStatus = async (
  params: {
    uuid: string;
    organizationId: string;
    data: UpdateIntakeTriageStatusRequest;
  },
  ctx: ServiceContext,
): Promise<Result<{
  success: boolean;
  data: {
    uuid: string;
    triage_status: TriageStatus;
    triage_reason: string | null;
    triage_decided_at: Date | null;
  };
}>> => {
  const { uuid, organizationId, data } = params;
  ForbiddenError.from(ctx.ability).throwUnlessCan('update', 'Organization');

  try {
    const intake = await practiceClientIntakesRepository.findById(uuid);
    if (!intake) {
      return result.notFound('Intake not found');
    }

    if (intake.organization_id !== organizationId) {
      return result.forbidden('Access denied');
    }

    const nextTriageStatus = data.status;
    const nextReason = nextTriageStatus === 'declined' ? data.reason?.trim() ?? null : null;

    const updatedIntake = await practiceClientIntakesRepository.update(uuid, {
      triage_status: nextTriageStatus,
      triage_reason: nextReason,
      triage_decided_at: new Date(),
    });

    return result.ok({
      success: true,
      data: {
        uuid: updatedIntake.id,
        triage_status: normalizeTriageStatus(updatedIntake.triage_status),
        triage_reason: updatedIntake.triage_reason ?? null,
        triage_decided_at: updatedIntake.triage_decided_at ?? null,
      },
    });
  } catch (error) {
    logger.error('Failed to update triage status for intake {uuid}: {error}', { uuid, error });
    return result.internalError('Failed to update intake triage status');
  }
};

export const intakeQueryService = {
  getPracticeClientIntakeSettings,
  listIntakes,
  updateIntakeTriageStatus,
};
