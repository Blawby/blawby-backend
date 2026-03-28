/**
 * Cloudflare Images Service
 *
 * Handles direct upload URL generation for Cloudflare Images
 */

import { config } from '@/shared/config';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const getString = (value: Record<string, unknown>, key: string): string | undefined => {
  const property = value[key];
  return typeof property === 'string' ? property : undefined;
};

const getRecord = (value: Record<string, unknown>, key: string): Record<string, unknown> | null => {
  const property = value[key];
  return isRecord(property) ? property : null;
};

const parseJsonResponse = async (response: Response, fallback: unknown): Promise<unknown> => {
  const body = await response.text();
  if (!body) {
    return fallback;
  }

  try {
    return JSON.parse(body) as unknown;
  } catch {
    return fallback;
  }
};

const getErrorMessage = (errorData: unknown, fallback: string): string => {
  if (!isRecord(errorData)) {
    return fallback;
  }

  const { errors } = errorData;
  if (errorData.success === false && Array.isArray(errors) && errors.length > 0 && isRecord(errors[0])) {
    return getString(errors[0], 'message') ?? getString(errors[0], 'error') ?? fallback;
  }

  return getString(errorData, 'message') ?? getString(errorData, 'detail') ?? fallback;
};

/**
 * Generate direct upload URL for Cloudflare Images
 * Cloudflare Images uses a different API than R2
 */
const generateImagesUploadUrl = async (params: {
  accountHash?: string;
  apiToken?: string;
}): Promise<{
  uploadUrl: string;
  imageId: string | null;
}> => {
  const accountHash = params.accountHash ?? config.cloudflare.imagesAccountHash;
  const apiToken = params.apiToken ?? config.cloudflare.imagesApiToken;

  if (!accountHash || !apiToken) {
    throw new Error(
      'CLOUDFLARE_IMAGES_ACCOUNT_HASH and CLOUDFLARE_IMAGES_API_TOKEN environment variables are required'
    );
  }

  // POST to Cloudflare API to get upload URL and image ID
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountHash}/images/v2/direct_upload`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiToken}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const error = await parseJsonResponse(response, { error: 'Unknown error' });
    throw new Error(`Failed to generate upload URL: ${JSON.stringify(error)}`);
  }

  const data = await parseJsonResponse(response, {});
  const result = isRecord(data) ? getRecord(data, 'result') : null;

  return {
    uploadUrl: result ? (getString(result, 'uploadURL') ?? '') : '',
    imageId: result ? (getString(result, 'id') ?? null) : null,
  };
};

/**
 * Get image URL from Cloudflare Images
 */
const getImageUrl = (params: {
  accountHash?: string;
  imageId: string;
  variant?: string; // Example values: 'public', 'thumbnail'
}): string => {
  const accountHash = params.accountHash ?? config.cloudflare.imagesAccountHash;

  if (!accountHash) {
    throw new Error('CLOUDFLARE_IMAGES_ACCOUNT_HASH environment variable is required');
  }

  const variant = params.variant ?? 'public';
  return `https://imagedelivery.net/${accountHash}/${params.imageId}/${variant}`;
};

/**
 * Delete image from Cloudflare Images
 */
const deleteImage = async (params: { accountHash?: string; apiToken?: string; imageId: string }): Promise<void> => {
  const accountHash = params.accountHash ?? config.cloudflare.imagesAccountHash;
  const apiToken = params.apiToken ?? config.cloudflare.imagesApiToken;

  if (!accountHash || !apiToken) {
    throw new Error(
      'CLOUDFLARE_IMAGES_ACCOUNT_HASH and CLOUDFLARE_IMAGES_API_TOKEN environment variables are required'
    );
  }

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountHash}/images/v1/${params.imageId}`,
    {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${apiToken}`,
      },
    }
  );

  if (!response.ok) {
    const errorData = await parseJsonResponse(response, {});
    throw new Error(getErrorMessage(errorData, 'Failed to delete image'));
  }
};

export const cloudflareImagesService = {
  generateImagesUploadUrl,
  getImageUrl,
  deleteImage,
};
