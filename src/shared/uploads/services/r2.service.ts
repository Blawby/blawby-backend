/**
 * Cloudflare R2 Service
 *
 * Handles presigned URL generation for direct uploads to Cloudflare R2
 * R2 is S3-compatible, so we use AWS SDK
 */

import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from '@/shared/config';

// Lazy initialization of R2 client
let _r2Client: S3Client | null = null;

/**
 * Initialize and return R2 client instance
 */
const initR2Client = (): S3Client | null => {
  if (!_r2Client) {
    const { accountId } = config.cloudflare;
    const accessKeyId = config.cloudflare.r2AccessKeyId;
    const secretAccessKey = config.cloudflare.r2SecretAccessKey;

    if (!accountId || !accessKeyId || !secretAccessKey) {
      return null;
    }

    _r2Client = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });
  }

  return _r2Client;
};

/**
 * Get R2 client instance
 */
const getR2Client = (): S3Client | null => initR2Client();

/**
 * Generate presigned URL for uploading to R2
 */
const generatePresignedUploadUrl = async (params: {
  bucket: string;
  key: string;
  contentType: string;
  expiresIn?: number; // Seconds, default 15 minutes
}): Promise<string | null> => {
  const client = getR2Client();
  if (!client) {
    return null;
  }
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
const generatePresignedDownloadUrl = async (params: {
  bucket: string;
  key: string;
  expiresIn?: number; // Seconds, default 15 minutes
}): Promise<string | null> => {
  const client = getR2Client();
  if (!client) {
    return null;
  }
  const expiresIn = params.expiresIn ?? 15 * 60; // 15 minutes default

  // For download, we use GetObjectCommand
  const getCommand = new GetObjectCommand({
    Bucket: params.bucket,
    Key: params.key,
  });

  return await getSignedUrl(client, getCommand, { expiresIn });
};

type FileMetadata = {
  exists: true;
  contentType: string | null;
  contentLength: number | null;
} | { exists: false };

const getFileMetadata = async (params: { bucket: string; key: string }): Promise<FileMetadata> => {
  const client = getR2Client();
  if (!client) return { exists: false };

  try {
    const response = await client.send(new HeadObjectCommand({ Bucket: params.bucket, Key: params.key }));
    return {
      exists: true,
      contentType: response.ContentType ?? null,
      contentLength: response.ContentLength ?? null,
    };
  } catch (error) {
    const statusCode =
      typeof error === 'object' && error !== null && '$metadata' in error
        ? (error.$metadata as { httpStatusCode?: number }).httpStatusCode
        : undefined;
    const errorName = typeof error === 'object' && error !== null && 'name' in error ? error.name : undefined;

    if (statusCode === 404 || errorName === 'NotFound') {
      return { exists: false };
    }

    throw error;
  }
};

const verifyFileExists = async (params: { bucket: string; key: string }): Promise<boolean> => {
  const result = await getFileMetadata(params);
  return result.exists;
};

/**
 * Delete file from R2
 */
const deleteFile = async (params: { bucket: string; key: string }): Promise<void> => {
  const client = getR2Client();
  if (!client) {
    return;
  }
  const command = new DeleteObjectCommand({
    Bucket: params.bucket,
    Key: params.key,
  });

  await client.send(command);
};

export const r2Service = {
  generatePresignedUploadUrl,
  generatePresignedDownloadUrl,
  getFileMetadata,
  verifyFileExists,
  deleteFile,
};
