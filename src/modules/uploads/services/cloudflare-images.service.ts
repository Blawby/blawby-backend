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
  accountHash?: string;
  apiToken?: string;
}): Promise<{
  uploadUrl: string;
  imageId: string | null;
}> => {
  const accountHash = params.accountHash ?? process.env.CLOUDFLARE_IMAGES_ACCOUNT_HASH;
  const apiToken = params.apiToken ?? process.env.CLOUDFLARE_IMAGES_API_TOKEN;

  if (!accountHash || !apiToken) {
    throw new Error(
      'CLOUDFLARE_IMAGES_ACCOUNT_HASH and CLOUDFLARE_IMAGES_API_TOKEN environment variables are required',
    );
  }

  // POST to Cloudflare API to get upload URL and image ID
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountHash}/images/v2/direct_upload`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
    },
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(`Failed to generate upload URL: ${JSON.stringify(error)}`);
  }

  const data = await response.json();
  return {
    uploadUrl: data.result?.uploadURL || '',
    imageId: data.result?.id || null,
  };
};

/**
 * Get image URL from Cloudflare Images
 */
export const getImageUrl = (params: {
  accountHash?: string;
  imageId: string;
  variant?: string; // e.g., 'public', 'thumbnail'
}): string => {
  const accountHash = params.accountHash ?? process.env.CLOUDFLARE_IMAGES_ACCOUNT_HASH;

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
  accountHash?: string;
  apiToken?: string;
  imageId: string;
}): Promise<void> => {
  const accountHash = params.accountHash ?? process.env.CLOUDFLARE_IMAGES_ACCOUNT_HASH;
  const apiToken = params.apiToken ?? process.env.CLOUDFLARE_IMAGES_API_TOKEN;

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
    const errorData = await response.json().catch(() => ({}));
    
    // Extract Cloudflare-specific error message
    let errorMessage = 'Failed to delete image';
    if (errorData.success === false && Array.isArray(errorData.errors) && errorData.errors.length > 0) {
      errorMessage = errorData.errors[0]?.message || errorData.errors[0]?.error || errorMessage;
    } else if (errorData.message) {
      errorMessage = errorData.message;
    } else if (errorData.detail) {
      errorMessage = errorData.detail;
    }
    
    throw new Error(errorMessage);
  }
};
