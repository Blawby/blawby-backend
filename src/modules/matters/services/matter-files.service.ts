import { ForbiddenError } from '@casl/ability';
import { HTTPException } from 'hono/http-exception';

import { matterFilesQueries } from '@/modules/matters/database/queries/matter-files.queries';
import { mattersService } from '@/modules/matters/services/matters.service';
import { uploadsRepository } from '@/shared/uploads/queries/uploads.repository';
import type { SelectUpload } from '@/shared/uploads/schema/uploads.schema';
import type { ServiceContext } from '@/shared/types/service-context';

const ensureMatterAccess = async (matterId: string, ctx: ServiceContext, action: 'create' | 'read'): Promise<void> => {
  try {
    ForbiddenError.from(ctx.ability).throwUnlessCan(action, 'Upload');
  } catch {
    throw new HTTPException(403, { message: 'Access denied' });
  }

  const accessResult = await mattersService.verifyMatterAccess(matterId, ctx);
  if (accessResult.success) {
    return;
  }

  const status = accessResult.error.status === 404 ? 404 : 403;
  throw new HTTPException(status, { message: accessResult.error.message });
};

const toUploadShape = (upload: SelectUpload) => ({
  upload_id: upload.id,
  file_name: upload.file_name,
  file_size: upload.file_size,
  file_type: upload.file_type,
  mime_type: upload.mime_type,
  status: upload.status,
  storage_key: upload.storage_key,
  public_url: upload.public_url,
  scope_type: upload.scope_type,
  scope_id: upload.scope_id,
  created_at: upload.created_at,
});

const assertLinkableUpload = async (uploadId: string, ctx: ServiceContext) => {
  const upload = await uploadsRepository.findById(uploadId, ctx.db);
  if (!upload) {
    throw new HTTPException(404, { message: 'Upload not found' });
  }

  if (upload.organization_id !== ctx.organizationId) {
    throw new HTTPException(403, { message: 'Upload does not belong to this organization' });
  }

  if (upload.deleted_at) {
    throw new HTTPException(400, { message: 'Upload is deleted and cannot be linked' });
  }

  if (upload.status !== 'verified') {
    throw new HTTPException(400, { message: 'Upload must be confirmed before linking' });
  }

  return upload;
};

export const matterFilesService = {
  async linkUpload({ matterId, uploadId }: { matterId: string; uploadId: string }, ctx: ServiceContext) {
    await ensureMatterAccess(matterId, ctx, 'create');
    const upload = await assertLinkableUpload(uploadId, ctx);

    const created = await matterFilesQueries.createLink(
      {
        matter_id: matterId,
        upload_id: uploadId,
        linked_by: ctx.userId,
      },
      ctx.db
    );

    if (!created) {
      const existing = await matterFilesQueries.findLink(matterId, uploadId, ctx.db);
      if (!existing) {
        throw new HTTPException(409, { message: 'Link could not be created or found' });
      }
      return {
        id: existing.id,
        matter_id: matterId,
        upload_id: uploadId,
        linked_at: existing.linked_at,
        linked_by: existing.linked_by,
        upload: toUploadShape(upload),
      };
    }

    return {
      id: created.id,
      matter_id: matterId,
      upload_id: uploadId,
      linked_at: created.linked_at,
      linked_by: created.linked_by,
      upload: toUploadShape(upload),
    };
  },

  async listMatterFiles({ matterId }: { matterId: string }, ctx: ServiceContext) {
    await ensureMatterAccess(matterId, ctx, 'read');

    const rows = await matterFilesQueries.listByMatter(matterId, ctx.db);

    return rows.map((row) => ({
      id: row.link_id,
      matter_id: matterId,
      upload_id: row.upload.id,
      linked_by: row.linked_by,
      linked_at: row.linked_at,
      upload: toUploadShape(row.upload),
    }));
  },

  async unlinkUpload({ matterId, uploadId }: { matterId: string; uploadId: string }, ctx: ServiceContext) {
    await ensureMatterAccess(matterId, ctx, 'create');

    const deleted = await matterFilesQueries.deleteLink(matterId, uploadId, ctx.db);
    if (!deleted) {
      throw new HTTPException(404, { message: 'Matter file link not found' });
    }

    return { success: true };
  },
};
