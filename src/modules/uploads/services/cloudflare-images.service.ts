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
} | null> => {
  const accountHash = params.accountHash ?? config.cloudflare.imagesAccountHash;
  const apiToken = params.apiToken ?? config.cloudflare.imagesApiToken;

  if (!accountHash || !apiToken) {
    return null;
  }

  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountHash}/images/v2/direct_upload`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiToken}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    return null;
  }

  const data = await parseJsonResponse(response, {});
  const result = isRecord(data) ? getRecord(data, 'result') : null;
  const uploadUrl = result ? getString(result, 'uploadURL') : undefined;

  if (!uploadUrl) {
    return null;
  }

  return {
    uploadUrl,
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
}): string | null => {
  const accountHash = params.accountHash ?? config.cloudflare.imagesAccountHash;

  if (!accountHash) {
    return null;
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
    return;
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
    return;
  }
};

export const cloudflareImagesService = {
  generateImagesUploadUrl,
  getImageUrl,
  deleteImage,
};
