import type { z } from '@hono/zod-openapi';
import { mattersQueries } from '@/modules/matters/database/queries/matters.queries';
import { matterMilestones } from '@/modules/matters/database/schema/matter-milestones.schema';
import { matterNotes } from '@/modules/matters/database/schema/matter-notes.schema';
import type { MatterResponse } from '@/modules/matters/types/matter.types';
import { organizationRepository } from '@/modules/practice/database/queries/organization.repository';
import { practiceClientIntakesRepository } from '@/modules/practice-client-intakes/database/queries/practice-client-intakes.repository';
import {
  getStaffAccessibleIntake,
  ensureStaffOrganizationAccess,
} from '@/modules/practice-client-intakes/services/intake-access.helpers';
import { intakeSharedHelpers } from '@/modules/practice-client-intakes/services/intake-shared.helpers';
import type {
  UpdateIntakeTriageStatusRequest,
  UpdateIntakeTriageStatusResponse,
} from '@/modules/practice-client-intakes/types/practice-client-intakes.types';
import type { intakeValidations } from '@/modules/practice-client-intakes/validations/practice-client-intakes.validation';
import { clientsRepository } from '@/modules/clients/database/queries/clients.queries';
import { createBetterAuthInstance } from '@/shared/auth/better-auth';
import { db } from '@/shared/database';
import { uow, type Tx } from '@/shared/database/uow';
import { IntakeTriaged } from '@/shared/events/definitions';
import { appConfigService } from '@/shared/services/app-config.service';
import type { PrefillData } from '@/shared/types/prefill';
import type { ServiceContext } from '@/shared/types/service-context';
import { getMatchingFrontendUrl } from '@/shared/utils/env';
import { getLogger } from '@logtape/logtape';
import { HTTPException } from 'hono/http-exception';

const logger = getLogger(['practice-client-intakes', 'service']);

type ListIntakeItem = z.infer<typeof intakeValidations.listIntakesResponseSchema>['intakes'][number];

const listIntakes = async (
  params: {
    query: z.infer<typeof intakeValidations.listIntakesQuerySchema>;
  },
  ctx: ServiceContext
): Promise<{ intakes: ListIntakeItem[]; total: number; page: number; limit: number; total_pages: number }> => {
  try {
    ensureStaffOrganizationAccess(ctx.organizationId, ctx);

    if (params.query.from && !intakeSharedHelpers.parseValidDate(params.query.from)) {
      throw new HTTPException(400, { message: 'Invalid date: from' });
    }

    if (params.query.to && !intakeSharedHelpers.parseValidDate(params.query.to)) {
      throw new HTTPException(400, { message: 'Invalid date: to' });
    }

    const { intakes, total } = await practiceClientIntakesRepository.findByOrganizationId({
      organizationId: ctx.organizationId,
      ...params.query,
      from: params.query.from ? new Date(params.query.from) : undefined,
      to: params.query.to ? new Date(params.query.to) : undefined,
    });

    return {
      intakes: intakes.map((intake) => intakeSharedHelpers.formatIntakeListItem(intake, { isAdmin: true })),
      total,
      page: params.query.page,
      limit: params.query.limit,
      total_pages: Math.ceil(total / params.query.limit),
    };
  } catch (error) {
    logger.error('Failed to list intakes for organization {organizationId}: {error}', {
      organizationId: ctx.organizationId,
      error,
    });
    throw error;
  }
};

const getIntakeById = async (
  id: string,
  ctx: ServiceContext
): Promise<z.infer<typeof intakeValidations.practiceClientIntakeStatusResponseSchema>> => {
  try {
    const intake = await getStaffAccessibleIntake(id, ctx, 'read');

    return intakeSharedHelpers.formatIntakeStatusResponse(intake, { isAdmin: true });
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
    const intake = await getStaffAccessibleIntake(params.uuid, ctx, 'update');

    const nextTriageStatus = params.data.status;
    const nextReason = nextTriageStatus === 'declined' ? (params.data.reason?.trim() ?? null) : null;

    const updatedIntake = await practiceClientIntakesRepository.update(params.uuid, {
      triage_status: nextTriageStatus,
      triage_reason: nextReason,
      triage_decided_at: new Date(),
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
              actorId: ctx.userId,
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
  } catch (error) {
    logger.error('Failed to update triage status for intake {uuid}: {error}', {
      uuid: params.uuid,
      error,
    });
    throw error;
  }
};

const createMatterFromIntakeTx = async (params: {
  uuid: string;
  data: z.infer<typeof intakeValidations.convertIntakeSchema>;
  intake: Awaited<ReturnType<typeof getStaffAccessibleIntake>>;
  metadata: NonNullable<ReturnType<typeof intakeSharedHelpers.parseMetadata>>;
  userId: string;
  tx: Tx;
  practiceClientIntakesRepository: typeof practiceClientIntakesRepository;
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

  const matter = await mattersQueries.createMatter(
    {
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
    }
  );

  if (params.intake.court_date) {
    await params.tx.insert(matterMilestones).values({
      matter_id: matter.id,
      description: 'Court Date from Intake',
      amount: 0,
      due_date: params.intake.court_date.toISOString().split('T')[0],
      status: 'pending',
      order: 999,
    });
  }

  if (params.intake.desired_outcome) {
    await params.tx.insert(matterNotes).values({
      matter_id: matter.id,
      user_id: params.userId,
      content: `Desired outcome: ${params.intake.desired_outcome}`,
    });
  }

  if (typeof params.intake.case_strength === 'number') {
    await params.tx.insert(matterNotes).values({
      matter_id: matter.id,
      user_id: params.userId,
      content: `Case strength score from intake: ${params.intake.case_strength}`,
    });
  }

  await params.practiceClientIntakesRepository.updateStatus(params.uuid, 'converted');

  return matter.id;
};

const toMatterResponse = (
  matter: NonNullable<Awaited<ReturnType<typeof mattersQueries.findMatterByIdWithRelations>>>
): MatterResponse => ({
  ...matter,
  // oxlint-disable-next-line no-unsafe-type-assertion
  status: matter.status as MatterResponse['status'],
  // oxlint-disable-next-line no-unsafe-type-assertion
  payment_frequency: (matter.payment_frequency as 'project' | 'milestone' | null) ?? null,
  // oxlint-disable-next-line no-unsafe-type-assertion
  urgency: (matter.urgency as MatterResponse['urgency']) ?? null,
  deleted_at: matter.deleted_at ?? null,
  open_date: matter.open_date ?? null,
  close_date: matter.close_date ?? null,
  last_conflict_check_result: (matter.last_conflict_check_result as Record<string, unknown> | null) ?? null,
});

const convertIntake = async (
  params: {
    uuid: string;
    data: z.infer<typeof intakeValidations.convertIntakeSchema>;
  },
  ctx: ServiceContext
): Promise<{ matter_id: string; matter: MatterResponse }> => {
  try {
    const intake = await getStaffAccessibleIntake(params.uuid, ctx, 'update');
    if (intake.status === 'converted') {
      const existingMatter = await mattersQueries.findByIntakeUuid(params.uuid);
      if (existingMatter) {
        const existingMatterWithRelations = await mattersQueries.findMatterByIdWithRelations(existingMatter.id);
        if (!existingMatterWithRelations) {
          throw new HTTPException(409, { message: 'Intake is marked as converted but no associated matter was found' });
        }

        return {
          matter_id: existingMatter.id,
          matter: toMatterResponse(existingMatterWithRelations),
        };
      }

      throw new HTTPException(409, { message: 'Intake is marked as converted but no associated matter was found' });
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

    const matterId = await uow.transaction(async ({ tx, repositories }) =>
      createMatterFromIntakeTx({
        uuid: params.uuid,
        data: params.data,
        intake,
        metadata,
        userId: ctx.userId,
        tx,
        practiceClientIntakesRepository: repositories.practiceClientIntakesRepository,
      })
    );

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
  params: { uuid: string; origin?: string | null },
  ctx: ServiceContext
): Promise<{ message: string }> => {
  try {
    const intake = await getStaffAccessibleIntake(params.uuid, ctx, 'update');
    const metadata = intakeSharedHelpers.parseMetadata(intake.metadata);
    if (!metadata?.email) {
      throw new HTTPException(400, { message: 'No email address found in intake data' });
    }

    const organization = await organizationRepository.findById(intake.organization_id);
    if (!organization) {
      throw new HTTPException(404, { message: 'Organization not found' });
    }

    const prefillData: PrefillData = {
      type: 'intake',
      intakeId: params.uuid,
      conversationId: intake.conversation_id ?? '',
      email: metadata.email,
      orgName: organization.name,
      orgSlug: organization.slug,
    };

    const encodedData = Buffer.from(JSON.stringify(prefillData)).toString('base64url');
    const auth = createBetterAuthInstance(db);
    const intakeRedirectUrl = await appConfigService.get<string>('intake_redirect_url');
    const redirectPath = intakeRedirectUrl ?? 'auth/accept-invitation';
    const separator = redirectPath.includes('?') ? '&' : '?';

    await auth.api.signInMagicLink({
      body: {
        email: metadata.email,
        callbackURL: `${getMatchingFrontendUrl(params.origin)}/${redirectPath}${separator}data=${encodedData}`,
      },
      headers: params.origin ? { origin: params.origin } : {},
    });

    return { message: 'Magic link sent to client email' };
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
