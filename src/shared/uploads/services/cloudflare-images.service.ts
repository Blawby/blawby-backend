import { getLogger } from '@logtape/logtape';

const logger = getLogger(['uploads', 'cloudflare-images']);

export const cloudflareImagesService = {
  async generateDirectUploadUrl({
    accountId,
    apiToken,
  }: {
    accountId: string;
    apiToken: string;
  }): Promise<{ uploadUrl: string; imageId: string } | null> {
    try {
      const response = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${accountId}/images/v2/direct_upload`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiToken}`,
          },
        }
      );

      if (!response.ok) {
        logger.error('CF Images direct upload request failed: {status}', { status: response.status });
        return null;
      }

      const data = (await response.json()) as {
        result: { uploadURL: string; id: string };
        success: boolean;
      };

      if (!data.success) {
        logger.error('CF Images direct upload returned success=false');
        return null;
      }

      return { uploadUrl: data.result.uploadURL, imageId: data.result.id };
    } catch (error) {
      logger.error('CF Images direct upload error: {error}', { error });
      return null;
    }
  },

  getImageUrl({
    accountHash,
    imageId,
    variant = 'public',
  }: {
    accountHash: string;
    imageId: string;
    variant?: string;
  }): string {
    return `https://imagedelivery.net/${accountHash}/${imageId}/${variant}`;
  },
};
