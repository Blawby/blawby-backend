/**
 * Cloudflare Images Service
 *
 * Handles direct upload URL generation for Cloudflare Images
 */

/**
 * Generate direct upload URL for Cloudflare Images
 * Cloudflare Images uses a different API than R2
 */
export const generateImagesUploadUrl = async (params: {
  accountHash: string;
  apiToken: string;
}): Promise<{
  uploadUrl: string;
  imageId: string | null;
}> => {
  const accountHash = params.accountHash || process.env.CLOUDFLARE_IMAGES_ACCOUNT_HASH;
  const apiToken = params.apiToken || process.env.CLOUDFLARE_IMAGES_API_TOKEN;

  if (!accountHash || !apiToken) {
    throw new Error(
      'CLOUDFLARE_IMAGES_ACCOUNT_HASH and CLOUDFLARE_IMAGES_API_TOKEN environment variables are required',
    );
  }

  // Cloudflare Images direct upload endpoint
  const uploadUrl = `https://api.cloudflare.com/client/v4/accounts/${accountHash}/images/v2/direct_upload`;

  // Return the upload URL - frontend will POST to this with the image
  // The response from Cloudflare will include the image ID
  return {
    uploadUrl,
    imageId: null, // Will be set after upload completes
  };
};

/**
 * Get image URL from Cloudflare Images
 */
export const getImageUrl = (params: {
  accountHash: string;
  imageId: string;
  variant?: string; // e.g., 'public', 'thumbnail'
}): string => {
  const accountHash = params.accountHash || process.env.CLOUDFLARE_IMAGES_ACCOUNT_HASH;

  if (!accountHash) {
    throw new Error('CLOUDFLARE_IMAGES_ACCOUNT_HASH environment variable is required');
  }

  const variant = params.variant || 'public';
  return `https://imagedelivery.net/${accountHash}/${params.imageId}/${variant}`;
};

/**
 * Delete image from Cloudflare Images
 */
export const deleteImage = async (params: {
  accountHash: string;
  apiToken: string;
  imageId: string;
}): Promise<void> => {
  const accountHash = params.accountHash || process.env.CLOUDFLARE_IMAGES_ACCOUNT_HASH;
  const apiToken = params.apiToken || process.env.CLOUDFLARE_IMAGES_API_TOKEN;

  if (!accountHash || !apiToken) {
    throw new Error(
      'CLOUDFLARE_IMAGES_ACCOUNT_HASH and CLOUDFLARE_IMAGES_API_TOKEN environment variables are required',
    );
  }

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountHash}/images/v1/${params.imageId}`,
    {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${apiToken}`,
      },
    },
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(`Failed to delete image: ${JSON.stringify(error)}`);
  }
};
