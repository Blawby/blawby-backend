import { getLogger } from '@logtape/logtape';
import { cloudflareImagesService } from '@/modules/uploads/services/cloudflare-images.service';
import { cloudflareR2Service } from '@/modules/uploads/services/cloudflare-r2.service';
import type { SelectUpload } from '@/modules/uploads/database/schema/uploads.schema';
import { config } from '@/shared/config';
import type { Result } from '@/shared/types/result';
import { internalError, ok, badRequest } from '@/shared/utils/result';

const logger = getLogger(['uploads', 'storage-provider-service']);

export const storageProviderService = {
  async createUploadTarget(params: {
    storageProvider: 'r2' | 'images';
    storageKey: string;
    mimeType: string;
  }): Promise<Result<{ presignedUrl: string; method: 'PUT' | 'POST' }>> {
    if (params.storageProvider === 'images') {
      const accountHash = config.cloudflare.imagesAccountHash;
      const apiToken = config.cloudflare.imagesApiToken;

      if (!accountHash || !apiToken) {
        logger.error('Cloudflare Images not configured');
        return internalError('Image storage configuration error');
      }

      const uploadTarget = await cloudflareImagesService.generateImagesUploadUrl({
        accountHash,
        apiToken,
      });
      if (!uploadTarget) {
        return internalError('Failed to generate image upload URL');
      }

      return ok({
        presignedUrl: uploadTarget.uploadUrl,
        method: 'POST',
      });
    }

    const bucket = config.cloudflare.r2BucketName;
    if (!bucket) {
      logger.error('CLOUDFLARE_R2_BUCKET_NAME not configured');
      return internalError('Storage configuration error');
    }

    const presignedUrl = await cloudflareR2Service.generatePresignedUploadUrl({
      bucket,
      key: params.storageKey,
      contentType: params.mimeType,
      expiresIn: 15 * 60,
    });
    if (!presignedUrl) {
      return internalError('Failed to generate presigned upload URL');
    }

    return ok({
      presignedUrl,
      method: 'PUT',
    });
  },

  async verifyStoredUpload(upload: SelectUpload): Promise<Result<void>> {
    if (upload.storage_provider !== 'r2') {
      return ok(undefined);
    }

    if (!upload.storage_key) {
      return badRequest('Storage key missing for R2 upload');
    }

    const bucket = config.cloudflare.r2BucketName;
    if (!bucket) {
      logger.error('CLOUDFLARE_R2_BUCKET_NAME not configured');
      return internalError('Storage configuration error');
    }

    const exists = await cloudflareR2Service.verifyFileExists({
      bucket,
      key: upload.storage_key,
    });

    if (!exists) {
      logger.warn('File not found in storage for upload {uploadId}', {
        uploadId: upload.id,
        storageKey: upload.storage_key,
      });

      return badRequest('File not found in storage. Please ensure upload succeeded before confirming.');
    }

    return ok(undefined);
  },

  buildPublicUrl(upload: SelectUpload): Result<string | null> {
    if (upload.storage_provider === 'r2') {
      const publicUrlBase = config.cloudflare.r2PublicUrl;
      if (!upload.storage_key || !publicUrlBase) {
        return ok(null);
      }

      return ok(`${publicUrlBase}/${upload.storage_key}`);
    }

    if (!upload.storage_key) {
      return ok(null);
    }

    const accountHash = config.cloudflare.imagesAccountHash;
    if (!accountHash) {
      logger.error('CLOUDFLARE_IMAGES_ACCOUNT_HASH not configured');
      return internalError('Image storage configuration error');
    }

    const imageUrl = cloudflareImagesService.getImageUrl({
      accountHash,
      imageId: upload.storage_key,
    });
    if (!imageUrl) {
      return internalError('Failed to build image URL');
    }

    return ok(imageUrl);
  },

  async createDownloadUrl(upload: SelectUpload): Promise<Result<{ downloadUrl: string; expiresAt: Date | null }>> {
    if (!upload.storage_key) {
      return internalError('Storage key missing for verified upload');
    }

    if (upload.storage_provider === 'images') {
      if (!upload.public_url) {
        return badRequest('Download URL not available for this image');
      }

      return ok({
        downloadUrl: upload.public_url,
        expiresAt: null,
      });
    }

    const bucket = config.cloudflare.r2BucketName;
    if (!bucket) {
      logger.error('CLOUDFLARE_R2_BUCKET_NAME not configured');
      return internalError('Storage configuration error');
    }

    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    const downloadUrl = await cloudflareR2Service.generatePresignedDownloadUrl({
      bucket,
      key: upload.storage_key,
      expiresIn: 15 * 60,
    });
    if (!downloadUrl) {
      return internalError('Failed to generate presigned download URL');
    }

    return ok({
      downloadUrl,
      expiresAt,
    });
  },
};
