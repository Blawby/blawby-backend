import type { z } from '@hono/zod-openapi';
import { ForbiddenError } from '@casl/ability';
import { mattersQueries } from '@/modules/matters/database/queries/matters.queries';
import { matterMilestones } from '@/modules/matters/database/schema/matter-milestones.schema';
import { matterNotes } from '@/modules/matters/database/schema/matter-notes.schema';
import type { MatterResponse } from '@/modules/matters/types/matter.types';
import { organizationRepository } from '@/modules/practice/database/queries/organization.repository';
import { practiceClientIntakesRepository } from '@/modules/practice-client-intakes/database/queries/practice-client-intakes.repository';
import { getIntakeById as getIntakeByIdOperation } from '@/modules/practice-client-intakes/operations/get-intake-by-id.operation';
import { listIntakes as listIntakesOperation } from '@/modules/practice-client-intakes/operations/list-intakes.operation';
import { updateIntakeTriageStatus as updateIntakeTriageStatusOperation } from '@/modules/practice-client-intakes/operations/update-intake-triage-status.operation';
import {
  getStaffAccessibleIntake,
  getStaffAccessibleIntakeForUpdate,
} from '@/modules/practice-client-intakes/services/intake-access.helpers';
import { intakePrefillTokenService } from '@/modules/practice-client-intakes/services/intake-prefill-token.service';
import { intakeSharedHelpers } from '@/modules/practice-client-intakes/services/intake-shared.helpers';
import type {
  IntakeStatusResponse,
  UpdateIntakeTriageStatusRequest,
  UpdateIntakeTriageStatusResponse,
} from '@/modules/practice-client-intakes/types/practice-client-intakes.types';
import type { intakeValidations } from '@/modules/practice-client-intakes/validations/practice-client-intakes.validation';
import { clientsRepository } from '@/modules/clients/database/queries/clients.queries';
import { createBetterAuthInstance } from '@/shared/auth/better-auth';
import { withMagicLinkDeliveryContext } from '@/shared/auth/magic-link-delivery-context';
import { db } from '@/shared/database';
import { getActiveTx, uow } from '@/shared/database/uow';
import { appConfigService } from '@/shared/services/app-config.service';
import { toLegalOperationContext } from '@/shared/types/legal-operation-context';
import type { OffsetPaginatedResponse } from '@/shared/types/pagination';
import type { ServiceContext } from '@/shared/types/service-context';
import { getMatchingFrontendUrl } from '@/shared/utils/env';
import { getLogger } from '@logtape/logtape';
import { HTTPException } from 'hono/http-exception';

const logger = getLogger(['practice-client-intakes', 'service']);

type ListIntakeItem = z.infer<typeof intakeValidations.listIntakesResponseSchema>['data'][number];

/** Staff-required + CASL authorization for the read-only staff surfaces; the operation only does the tenant/row check. */
const authorizeStaffRead = (ctx: ServiceContext): void => {
  if (!ctx.memberRole) {
    throw new HTTPException(403, { message: 'You do not have permission to access these intakes' });
  }
  ForbiddenError.from(ctx.ability).throwUnlessCan('read', 'PracticeClientIntake');
};

const listIntakes = async (
  params: {
    query: z.infer<typeof intakeValidations.listIntakesQuerySchema>;
  },
  ctx: ServiceContext
): Promise<OffsetPaginatedResponse<ListIntakeItem>> => {
  try {
    authorizeStaffRead(ctx);

    return await listIntakesOperation(
      { organizationId: ctx.organizationId, query: params.query },
      toLegalOperationContext(ctx)
    );
  } catch (error) {
    logger.error('Failed to list intakes for organization {organizationId}: {error}', {
      organizationId: ctx.organizationId,
      error,
    });
    throw error;
  }
};

const getIntakeById = async (id: string, ctx: ServiceContext): Promise<IntakeStatusResponse> => {
  try {
    authorizeStaffRead(ctx);

    return await getIntakeByIdOperation(id, toLegalOperationContext(ctx));
  } catch (error) {
    logger.error('Failed to get intake {id}: {error}', {
      id,
      error,
    });
    throw error;
  }
};

const updateTriageStatus = async (
  params: { uuid: string; data: UpdateIntakeTriageStatusRequest },
  ctx: ServiceContext
): Promise<UpdateIntakeTriageStatusResponse> => {
  try {
    if (!ctx.memberRole) {
      throw new HTTPException(403, { message: 'You do not have permission to access this intake' });
    }
    ForbiddenError.from(ctx.ability).throwUnlessCan('update', 'PracticeClientIntake');

    return await updateIntakeTriageStatusOperation(params, toLegalOperationContext(ctx));
  } catch (error) {
    logger.error('Failed to update triage status for intake {uuid}: {error}', {
      uuid: params.uuid,
      error,
    });
    throw error;
  }
};

const createMatterFromIntake = async (params: {
  uuid: string;
  data: z.infer<typeof intakeValidations.convertIntakeSchema>;
  intake: Awaited<ReturnType<typeof getStaffAccessibleIntake>>;
  metadata: NonNullable<ReturnType<typeof intakeSharedHelpers.parseMetadata>>;
  userId: string;
}): Promise<string> => {
  let clientId: string | undefined = undefined;
  if (params.metadata.user_id) {
    const clientRecord = await clientsRepository.findByOrgAndUser(
      params.intake.organization_id,
      params.metadata.user_id
    );
    if (clientRecord) {
      clientId = clientRecord.id;
    } else {
      logger.warn('User ID {userId} from intake metadata not found in clients for organization {organizationId}', {
        userId: params.metadata.user_id,
        organizationId: params.intake.organization_id,
        intakeUuid: params.uuid,
      });
    }
  }

  const matter = await mattersQueries.createMatter({
    organization_id: params.intake.organization_id,
    billing_type: params.data.billing_type ?? 'fixed',
    client_id: clientId,
    title: params.data.title ?? `Intake: ${params.metadata.name}`,
    description: params.metadata.description,
    status: params.data.status ?? 'engagement_pending',
    urgency: params.intake.urgency ?? 'routine',
    intake_uuid: params.uuid,
    conversation_id: params.intake.conversation_id,
    on_behalf_of: params.metadata.on_behalf_of,
    opposing_party: params.metadata.opposing_party,
    opposing_counsel: params.metadata.opposing_counsel,
    responsible_attorney_id: params.data.responsible_attorney_id,
    practice_service_id: params.data.practice_service_id,
    open_date: params.data.open_date ? new Date(params.data.open_date) : undefined,
  });

  if (params.intake.court_date) {
    await getActiveTx()
      .insert(matterMilestones)
      .values({
        matter_id: matter.id,
        description: 'Court Date from Intake',
        amount: 0,
        due_date: params.intake.court_date.toISOString().split('T')[0],
        status: 'pending',
        order: 999,
      });
  }

  if (params.intake.desired_outcome) {
    await getActiveTx()
      .insert(matterNotes)
      .values({
        matter_id: matter.id,
        user_id: params.userId,
        content: `Desired outcome: ${params.intake.desired_outcome}`,
      });
  }

  if (typeof params.intake.case_strength === 'number') {
    await getActiveTx()
      .insert(matterNotes)
      .values({
        matter_id: matter.id,
        user_id: params.userId,
        content: `Case strength score from intake: ${params.intake.case_strength}`,
      });
  }

  await practiceClientIntakesRepository.updateStatus(params.uuid, 'converted');

  return matter.id;
};

const toMatterResponse = (
  matter: NonNullable<Awaited<ReturnType<typeof mattersQueries.findMatterByIdWithRelations>>>
): MatterResponse => ({
  ...matter,
  payment_frequency: matter.payment_frequency ?? null,
  urgency: matter.urgency ?? null,
  deleted_at: matter.deleted_at ?? null,
  open_date: matter.open_date ?? null,
  close_date: matter.close_date ?? null,
  last_conflict_check_result: matter.last_conflict_check_result ?? null,
});

const convertIntake = async (
  params: {
    uuid: string;
    data: z.infer<typeof intakeValidations.convertIntakeSchema>;
  },
  ctx: ServiceContext
): Promise<{ matter_id: string; matter: MatterResponse }> => {
  try {
    const matterId = await uow.transaction(async () => {
      const intake = await getStaffAccessibleIntakeForUpdate(params.uuid, ctx);
      if (intake.status === 'converted') {
        const existingMatter = await mattersQueries.findByIntakeUuid(params.uuid);
        if (!existingMatter) {
          throw new HTTPException(409, { message: 'Intake is marked as converted but no associated matter was found' });
        }
        return existingMatter.id;
      }
      if (intake.status !== 'succeeded') {
        throw new HTTPException(400, { message: 'Only successful intakes can be converted to matters' });
      }
      if (intake.triage_status !== 'accepted') {
        throw new HTTPException(400, { message: 'Intake must be accepted before converting to a matter' });
      }

      const metadata = intakeSharedHelpers.parseMetadata(intake.metadata);
      if (!metadata) {
        throw new HTTPException(400, { message: 'Intake metadata is missing' });
      }

      return createMatterFromIntake({
        uuid: params.uuid,
        data: params.data,
        intake,
        metadata,
        userId: ctx.userId,
      });
    });

    const matter = await mattersQueries.findMatterByIdWithRelations(matterId);
    if (!matter) {
      throw new Error('Matter was created but could not be loaded');
    }

    return {
      matter_id: matterId,
      matter: toMatterResponse(matter),
    };
  } catch (error) {
    logger.error('Failed to convert intake {uuid} to matter: {error}', {
      uuid: params.uuid,
      error,
    });
    throw error;
  }
};

const triggerInvitation = async (
  params: {
    uuid: string;
    origin?: string | null;
    acceptedEmail?: { practiceName: string; recipientName: string };
  },
  ctx: ServiceContext
): Promise<{ message: string }> => {
  try {
    const intake = await getStaffAccessibleIntake(params.uuid, ctx, 'update');
    const metadata = intakeSharedHelpers.parseMetadata(intake.metadata);
    if (!metadata?.email) {
      throw new HTTPException(400, { message: 'No email address found in intake data' });
    }
    if (!intake.conversation_id) {
      throw new HTTPException(409, { message: 'Intake conversation is missing' });
    }

    const organization = await organizationRepository.findById(intake.organization_id);
    if (!organization) {
      throw new HTTPException(404, { message: 'Organization not found' });
    }

    const token = await intakePrefillTokenService.issue({
      intakeId: params.uuid,
      organizationId: intake.organization_id,
    });
    const auth = createBetterAuthInstance(db);
    const intakeRedirectUrl = await appConfigService.get<string>('intake_redirect_url');
    const redirectPath = intakeRedirectUrl ?? 'auth/accept-invitation';
    const separator = redirectPath.includes('?') ? '&' : '?';

    const sendMagicLink = async (): Promise<void> => {
      await auth.api.signInMagicLink({
        body: {
          email: metadata.email,
          callbackURL: `${getMatchingFrontendUrl(params.origin)}/${redirectPath}${separator}intakeToken=${encodeURIComponent(token)}`,
        },
        headers: params.origin ? { origin: params.origin } : {},
      });
    };

    if (params.acceptedEmail) {
      await withMagicLinkDeliveryContext(
        {
          kind: 'intake_accepted',
          intakeId: params.uuid,
          practiceName: params.acceptedEmail.practiceName,
          recipientName: params.acceptedEmail.recipientName,
        },
        sendMagicLink
      );
    } else {
      await sendMagicLink();
    }

    return { message: params.acceptedEmail ? 'Acceptance email sent to client' : 'Magic link sent to client email' };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const safeDetails: Record<string, unknown> = { message: errorMessage };
    if (error instanceof Error) {
      safeDetails.name = error.name;
    }
    if (typeof error === 'object' && error !== null) {
      if ('code' in error) {
        safeDetails.code = error.code;
      }
      if ('status' in error) {
        safeDetails.status = error.status;
      }
    }
    logger.error('Failed to send magic link for intake {uuid}: {error} {details}', {
      uuid: params.uuid,
      error: errorMessage,
      details: JSON.stringify(safeDetails),
    });
    throw error;
  }
};

export const intakeLifecycleService = {
  listIntakes,
  getIntakeById,
  updateTriageStatus,
  convertIntake,
  triggerInvitation,
};
