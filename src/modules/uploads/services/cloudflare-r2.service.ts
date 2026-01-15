/**
 * Cloudflare R2 Service
 *
 * Handles presigned URL generation for direct uploads to Cloudflare R2
 * R2 is S3-compatible, so we use AWS SDK
 */

import { S3Client, PutObjectCommand, HeadObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// Lazy initialization of R2 client
let _r2Client: S3Client | null = null;

/**
 * Initialize and return R2 client instance
 */
const initR2Client = (): S3Client => {
  if (!_r2Client) {
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY;

    if (!accountId || !accessKeyId || !secretAccessKey) {
      throw new Error(
        'CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_R2_ACCESS_KEY_ID, and CLOUDFLARE_R2_SECRET_ACCESS_KEY environment variables are required',
      );
    }

    _r2Client = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });
  }

  return _r2Client;
};

/**
 * Get R2 client instance
 */
const getR2Client = (): S3Client => {
  return initR2Client();
};

/**
 * Generate presigned URL for uploading to R2
 */
export const generatePresignedUploadUrl = async (params: {
  bucket: string;
  key: string;
  contentType: string;
  expiresIn?: number; // seconds, default 15 minutes
}): Promise<string> => {
  const client = getR2Client();
  const expiresIn = params.expiresIn ?? 15 * 60; // 15 minutes default

  const command = new PutObjectCommand({
    Bucket: params.bucket,
    Key: params.key,
    ContentType: params.contentType,
  });

  return await getSignedUrl(client, command, { expiresIn });
};

/**
 * Generate presigned URL for downloading from R2
 */
export const generatePresignedDownloadUrl = async (params: {
  bucket: string;
  key: string;
  expiresIn?: number; // seconds, default 15 minutes
}): Promise<string> => {
  const client = getR2Client();
  const expiresIn = params.expiresIn ?? 15 * 60; // 15 minutes default

  // For download, we use GetObjectCommand
  const getCommand = new GetObjectCommand({
    Bucket: params.bucket,
    Key: params.key,
  });

  return await getSignedUrl(client, getCommand, { expiresIn });
};

/**
 * Verify file exists in R2
 */
export const verifyFileExists = async (params: {
  bucket: string;
  key: string;
}): Promise<boolean> => {
  try {
    const client = getR2Client();
    const command = new HeadObjectCommand({
      Bucket: params.bucket,
      Key: params.key,
    });

    await client.send(command);
    return true;
  } catch {
    return false;
  }
};

/**
 * Delete file from R2
 */
export const deleteFile = async (params: {
  bucket: string;
  key: string;
}): Promise<void> => {
  const client = getR2Client();
  const command = new DeleteObjectCommand({
    Bucket: params.bucket,
    Key: params.key,
  });

  await client.send(command);
};
