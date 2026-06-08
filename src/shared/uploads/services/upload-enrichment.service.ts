import { and, eq, inArray } from 'drizzle-orm';
import { matters } from '@/modules/matters/database/schema/matters.schema';
import { practiceClientIntakes } from '@/modules/practice-client-intakes/database/schema/practice-client-intakes.schema';
import { users } from '@/schema/better-auth-schema';
import type { SelectUpload } from '@/shared/uploads/schema/uploads.schema';
import type { UploadMetadataEnrichment } from '@/shared/uploads/types/uploads.types';
import { getActiveTx } from '@/shared/database/uow';

export type { UploadMetadataEnrichment } from '@/shared/uploads/types/uploads.types';

export const defaultUploadMetadataEnrichment: UploadMetadataEnrichment = {
  uploadedByName: null,
  uploadedByEmail: null,
  scopeLabel: null,
};

const getIntakeScopeLabel = (metadata: unknown): string | null => {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return null;
  }

  const metadataRecord = metadata as Record<string, unknown>;
  if (typeof metadataRecord.name === 'string' && metadataRecord.name.trim().length > 0) {
    return metadataRecord.name;
  }
  if (typeof metadataRecord.email === 'string' && metadataRecord.email.trim().length > 0) {
    return metadataRecord.email;
  }

  return null;
};

export const buildUploadMetadataEnrichment = async (
  uploads: SelectUpload[],
  { organizationId }: { organizationId: string }
): Promise<Map<string, UploadMetadataEnrichment>> => {
  const enrichments = new Map<string, UploadMetadataEnrichment>();
  if (uploads.length === 0) {
    return enrichments;
  }

  const uploaderIds = Array.from(new Set(uploads.map((upload) => upload.user_id).filter((id): id is string => !!id)));
  const matterScopeIds = Array.from(
    new Set(
      uploads
        .filter((upload) => upload.scope_type === 'matter' && !!upload.scope_id)
        .map((upload) => upload.scope_id as string)
    )
  );
  const intakeScopeIds = Array.from(
    new Set(
      uploads
        .filter((upload) => upload.scope_type === 'intake' && !!upload.scope_id)
        .map((upload) => upload.scope_id as string)
    )
  );

  const [uploaderRows, matterRows, intakeRows] = await Promise.all([
    uploaderIds.length
      ? getActiveTx()
          .select({ id: users.id, name: users.name, email: users.email })
          .from(users)
          .where(inArray(users.id, uploaderIds))
      : Promise.resolve([]),
    matterScopeIds.length
      ? getActiveTx()
          .select({ id: matters.id, title: matters.title })
          .from(matters)
          .where(and(eq(matters.organization_id, organizationId), inArray(matters.id, matterScopeIds)))
      : Promise.resolve([]),
    intakeScopeIds.length
      ? getActiveTx()
          .select({ id: practiceClientIntakes.id, metadata: practiceClientIntakes.metadata })
          .from(practiceClientIntakes)
          .where(
            and(
              eq(practiceClientIntakes.organization_id, organizationId),
              inArray(practiceClientIntakes.id, intakeScopeIds)
            )
          )
      : Promise.resolve([]),
  ]);

  const uploaderMap = new Map(uploaderRows.map((row) => [row.id, { name: row.name, email: row.email }]));
  const matterLabelMap = new Map(matterRows.map((row) => [row.id, row.title]));
  const intakeLabelMap = new Map(intakeRows.map((row) => [row.id, getIntakeScopeLabel(row.metadata)]));

  for (const upload of uploads) {
    const uploader = upload.user_id ? uploaderMap.get(upload.user_id) : undefined;
    const scopeLabel =
      upload.scope_type === 'matter' && upload.scope_id
        ? (matterLabelMap.get(upload.scope_id) ?? null)
        : upload.scope_type === 'intake' && upload.scope_id
          ? (intakeLabelMap.get(upload.scope_id) ?? null)
          : null;

    enrichments.set(upload.id, {
      uploadedByName: uploader?.name ?? null,
      uploadedByEmail: uploader?.email ?? null,
      scopeLabel,
    });
  }

  return enrichments;
};
