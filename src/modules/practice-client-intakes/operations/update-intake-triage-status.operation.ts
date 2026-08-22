import { getLogger } from '@logtape/logtape';
import { HTTPException } from 'hono/http-exception';

import { intakeConversationsQueries } from '@/modules/intake-conversations/database/queries/intake-conversations.queries';
import { organizationRepository } from '@/modules/practice/database/queries/organization.repository';
import { practiceClientIntakesRepository } from '@/modules/practice-client-intakes/database/queries/practice-client-intakes.repository';
import { intakeSharedHelpers } from '@/modules/practice-client-intakes/services/intake-shared.helpers';
import type {
  UpdateIntakeTriageStatusRequest,
  UpdateIntakeTriageStatusResponse,
} from '@/modules/practice-client-intakes/types/practice-client-intakes.types';
import { uow } from '@/shared/database/uow';
import { IntakeTriaged } from '@/shared/events/definitions';
import { assertLegalOperationTenant, type LegalOperationContext } from '@/shared/types/legal-operation-context';

const logger = getLogger(['practice-client-intakes', 'update-intake-triage-status-operation']);

export const updateIntakeTriageStatus = async (
  params: { uuid: string; data: UpdateIntakeTriageStatusRequest },
  ctx: LegalOperationContext
): Promise<UpdateIntakeTriageStatusResponse> => {
  const intake = await practiceClientIntakesRepository.findById(params.uuid);
  if (!intake) {
    throw new HTTPException(404, { message: 'Practice client intake not found' });
  }
  assertLegalOperationTenant(ctx, intake.organization_id);

  const nextTriageStatus = params.data.status;
  const nextReason = nextTriageStatus === 'declined' ? (params.data.reason?.trim() ?? null) : null;

  const updatedIntake = await uow.transaction(async () => {
    const result = await practiceClientIntakesRepository.update(params.uuid, {
      triage_status: nextTriageStatus,
      triage_reason: nextReason,
      triage_decided_at: new Date(),
    });
    if (nextTriageStatus === 'accepted' && result.conversation_id) {
      await intakeConversationsQueries.updateLifecycleStatus(result.conversation_id, 'visible', ctx.organizationId);
    }
    return result;
  });

  // Emit triage event for email notifications
  const metadata = intakeSharedHelpers.parseMetadata(intake.metadata);

  if (metadata?.email) {
    try {
      const organization = await organizationRepository.findById(ctx.organizationId);

      if (organization) {
        void IntakeTriaged.dispatch(
          {
            intake_id: params.uuid,
            organization_id: ctx.organizationId,
            organization_name: organization.name,
            triage_status: nextTriageStatus,
            triage_reason: nextReason,
            client_email: metadata.email,
            client_name: metadata.name ?? metadata.email,
          },
          {
            actorId: ctx.userId ?? undefined,
            organizationId: ctx.organizationId,
          }
        );
      }
    } catch (enrichmentError) {
      logger.warn('Failed to enrich IntakeTriaged event for intake {uuid}: {error}', {
        uuid: params.uuid,
        error: enrichmentError,
      });
    }
  }

  return {
    uuid: updatedIntake.id,
    conversation_id: updatedIntake.conversation_id ?? null,
    triage_status: intakeSharedHelpers.normalizeTriageStatus(updatedIntake.triage_status),
    triage_reason: updatedIntake.triage_reason ?? null,
    triage_decided_at: updatedIntake.triage_decided_at ?? null,
  };
};
