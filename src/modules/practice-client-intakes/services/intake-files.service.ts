import { AbilityBuilder, createMongoAbility } from '@casl/ability';
import { HTTPException } from 'hono/http-exception';
import type { SelectPracticeClientIntake } from '@/modules/practice-client-intakes/database/schema/practice-client-intakes.schema';
import { getActorAccessibleIntake } from '@/modules/practice-client-intakes/services/intake-access.helpers';
import type {
  EnrichedServiceContextBase,
  ListFilesQuery,
  PresignBody,
} from '@/modules/practice-client-intakes/types/intake-files.types';
import type { AppAbility } from '@/shared/auth/abilities';
import { uploadsRepository } from '@/shared/uploads/queries/uploads.repository';
import { toUploadDetails, uploadCoreService } from '@/shared/uploads/services/upload-core.service';
import type { PresignUploadRequest } from '@/shared/uploads/types/uploads.types';
import { uow } from '@/shared/database/uow';
import { createServiceContext, type ServiceContext } from '@/shared/types/service-context';

const buildIntakeParticipantAbility = (): AppAbility => {
  const { can, build } = new AbilityBuilder<AppAbility>(createMongoAbility);
  can('create', 'Upload');
  can('read', 'Upload');
  can('update', 'Upload');
  can('delete', 'Upload');
  return build();
};

const buildEnrichedCtx = (ctx: ServiceContext, intake: SelectPracticeClientIntake): EnrichedServiceContextBase => ({
  userId: ctx.userId,
  user: ctx.user,
  organizationId: ctx.memberRole ? ctx.organizationId : intake.organization_id,
  memberRole: ctx.memberRole,
  matterId: ctx.matterId,
  requestHeaders: ctx.requestHeaders,
  ability: ctx.memberRole ? ctx.ability : buildIntakeParticipantAbility(),
});

const ensureUploadBelongsToIntake = async (uploadId: string, intakeId: string, ctx: ServiceContext) => {
  const upload = await uploadsRepository.findById(uploadId);
  if (!upload) {
    throw new HTTPException(404, { message: 'Upload not found' });
  }
  if (upload.scope_type !== 'intake' || upload.scope_id !== intakeId) {
    throw new HTTPException(403, { message: 'Upload does not belong to this intake' });
  }
  return upload;
};

export const intakeFilesService = {
  async presignFile({ uuid, body }: { uuid: string; body: PresignBody }, ctx: ServiceContext) {
    const intake = await getActorAccessibleIntake(uuid, ctx, 'update');
    const enrichedBase = buildEnrichedCtx(ctx, intake);
    const enrichedCtx = createServiceContext(enrichedBase);

    const uploadRequest: PresignUploadRequest = {
      file_name: body.file_name,
      mime_type: body.mime_type,
      file_size: body.file_size,
      scope_type: 'intake',
      scope_id: intake.id,
      is_privileged: true,
    };

    const prep = await uploadCoreService.preparePresign({ request: uploadRequest }, enrichedCtx);
    return uow.transaction(async () =>
      uploadCoreService.persistPresign({ prep, request: uploadRequest }, createServiceContext(enrichedBase))
    );
  },

  async confirmFile({ uuid, uploadId }: { uuid: string; uploadId: string }, ctx: ServiceContext) {
    const intake = await getActorAccessibleIntake(uuid, ctx, 'update');
    const enrichedBase = buildEnrichedCtx(ctx, intake);
    const enrichedCtx = createServiceContext(enrichedBase);

    await ensureUploadBelongsToIntake(uploadId, intake.id, ctx);
    const uploadCorePrep = await uploadCoreService.prepareConfirm({ id: uploadId }, enrichedCtx);
    return uow.transaction(async () =>
      uploadCoreService.persistConfirm({ prep: uploadCorePrep }, createServiceContext(enrichedBase))
    );
  },

  async listFiles({ uuid, query }: { uuid: string; query: ListFilesQuery }, ctx: ServiceContext) {
    const intake = await getActorAccessibleIntake(uuid, ctx, 'read');
    const enrichedBase = buildEnrichedCtx(ctx, intake);
    const enrichedCtx = createServiceContext(enrichedBase);
    const { page, limit } = query;
    const offset = (page - 1) * limit;

    const [uploads, total] = await Promise.all([
      uploadsRepository.listByOrganization(intake.organization_id, {
        scopeType: 'intake',
        scopeId: intake.id,
        limit,
        offset,
      }),
      uploadsRepository.countByOrganization(intake.organization_id, { scopeType: 'intake', scopeId: intake.id }),
    ]);

    return {
      uploads: uploads.map((upload) => toUploadDetails(upload)),
      total,
      page,
      limit,
    };
  },

  async deleteFile(
    { uuid, uploadId, reason }: { uuid: string; uploadId: string; reason: string },
    ctx: ServiceContext
  ): Promise<{ id: string; status: 'deleted' }> {
    const intake = await getActorAccessibleIntake(uuid, ctx, 'update');
    await ensureUploadBelongsToIntake(uploadId, intake.id, ctx);

    const enrichedBase = buildEnrichedCtx(ctx, intake);
    const result = await uow.transaction(async () =>
      uploadCoreService.softDelete({ id: uploadId, reason }, createServiceContext(enrichedBase))
    );

    return { id: result.id, status: 'deleted' };
  },
};
