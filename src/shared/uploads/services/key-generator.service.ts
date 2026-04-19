import { HTTPException } from 'hono/http-exception';
import type { UploadScopeType } from '@/shared/uploads/types/uploads.types';

const sanitizeFileName = (fileName: string): string =>
  fileName
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/\.\./g, '_')
    .replace(/^\./, '_')
    .substring(0, 255);

export const keyGeneratorService = {
  sanitizeFileName,

  generateStorageKey(params: {
    organizationId?: string | null;
    scopeType?: UploadScopeType;
    scopeId?: string;
    uploadId: string;
    fileName: string;
  }): string {
    if (!params.organizationId) {
      throw new HTTPException(400, { message: 'Organization context required for uploads' });
    }

    if ((params.scopeType && !params.scopeId) || (!params.scopeType && params.scopeId)) {
      throw new HTTPException(400, { message: 'scope_type and scope_id must be provided together' });
    }

    const safeFileName = sanitizeFileName(params.fileName);

    if (params.scopeType && params.scopeId) {
      const scopeFolderByType: Record<UploadScopeType, string> = {
        matter: 'matters',
        intake: 'intakes',
        conversation: 'conversations',
      };
      const scopeFolder = scopeFolderByType[params.scopeType];

      return `orgs/${params.organizationId}/${scopeFolder}/${params.scopeId}/uploads/${params.uploadId}_${safeFileName}`;
    }

    return `orgs/${params.organizationId}/uploads/${params.uploadId}_${safeFileName}`;
  },
};
