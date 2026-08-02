/**
 * Import Media Adapter — presigned upload contract for import media assets.
 *
 * Import media assets are stored separately from DOCX package content.
 * Domain separation: import media uses 'import-media' prefix, not 'uploads/attempts/'.
 * All media travels through presigned URL channel; never base64 audio in memory.
 */

import crypto from 'crypto';

export interface ImportMediaPresignResult {
  uploadUrl: string;
  s3Key: string;
  /** ISO-8601 expiry */
  expiresAt: string;
}

export interface ImportMediaPresignOptions {
  jobId: number;
  fileName: string;
  fileType: string;
  fileSize: number;
  /** Presigned URL lifetime in seconds (default 300 = 5 minutes) */
  expiresInSeconds?: number;
}

/** Allowed media types for import media. */
export const IMPORT_ALLOWED_MEDIA_TYPES = [
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/ogg',
  'audio/webm',
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
] as const;

export interface ImportMediaAdapter {
  generatePresignedUpload(options: ImportMediaPresignOptions): Promise<ImportMediaPresignResult>;
  retrieveFile(s3Key: string): Promise<Buffer>;
}

/**
 * Build S3 adapter for import media.
 * Uses 'import-media/' prefix for domain separation from other storage uses.
 */
function buildS3ImportMediaAdapter(): ImportMediaAdapter | null {
  const endpoint = process.env.S3_ENDPOINT;
  const region = process.env.S3_REGION || process.env.AWS_REGION || 'us-east-1';
  const accessKeyId = process.env.S3_ACCESS_KEY || process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_KEY || process.env.AWS_SECRET_ACCESS_KEY;
  const bucket = process.env.S3_BUCKET || process.env.AWS_S3_BUCKET || 'toeic-media';

  if (!accessKeyId || !secretAccessKey) {
    return null;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

    const client = new S3Client({
      region,
      credentials: { accessKeyId, secretAccessKey },
      ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
    });

    return {
      async generatePresignedUpload(options: ImportMediaPresignOptions): Promise<ImportMediaPresignResult> {
        const expiresInSeconds = Math.min(
          Math.max(60, options.expiresInSeconds || 300),
          3600
        );

        // Domain separation: import media prefix.
        const safeFileName = options.fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
        const key = `import-media/jobs/${options.jobId}/${safeFileName}`;

        const command = new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          ContentType: options.fileType,
          ContentLength: options.fileSize,
          CacheControl: 'no-store',
        });

        const uploadUrl = await getSignedUrl(client, command, {
          expiresIn: expiresInSeconds,
        });

        const expiresAt = new Date(Date.now() + expiresInSeconds * 1000).toISOString();

        return { uploadUrl, s3Key: key, expiresAt };
      },
      async retrieveFile(s3Key: string): Promise<Buffer> {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { GetObjectCommand } = require('@aws-sdk/client-s3');
        const command = new GetObjectCommand({ Bucket: bucket, Key: s3Key });
        const response = await client.send(command);
        const chunks: Buffer[] = [];
        for await (const chunk of response.Body as AsyncIterable<Buffer>) {
          chunks.push(chunk);
        }
        return Buffer.concat(chunks);
      },
    };
  } catch {
    return null;
  }
}

/**
 * Deterministic test adapter. No AWS credentials needed.
 */
export function createTestImportMediaAdapter(): ImportMediaAdapter {
  return {
    async generatePresignedUpload(options: ImportMediaPresignOptions): Promise<ImportMediaPresignResult> {
      const safeFileName = options.fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
      const key = `import-media/jobs/${options.jobId}/${safeFileName}`;
      const expiresAt = new Date(Date.now() + 300 * 1000).toISOString();

      return {
        uploadUrl: `https://test-bucket.s3.test.amazonaws.com/${encodeURIComponent(key)}?X-Amz-Test-Signature=mock`,
        s3Key: key,
        expiresAt,
      };
    },
    async retrieveFile(s3Key: string): Promise<Buffer> {
      throw new Error(`Object not found: ${s3Key}`);
    },
  };
}

let _adapter: ImportMediaAdapter | null = null;

export function getImportMediaAdapter(): ImportMediaAdapter {
  if (_adapter) return _adapter;

  const s3Adapter = buildS3ImportMediaAdapter();
  if (s3Adapter) {
    _adapter = s3Adapter;
    return _adapter;
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'Production requires S3 credentials for import media (S3_ACCESS_KEY/S3_SECRET_KEY)'
    );
  }

  _adapter = createTestImportMediaAdapter();
  return _adapter;
}

/** For testing: reset the singleton */
export function resetImportMediaAdapter(): void {
  _adapter = null;
}

/**
 * Validate media file name for zip-slip, path traversal, and special characters.
 * Returns sanitized name or throws.
 */
export function validateMediaFileName(name: string): string {
  // Reject absolute paths.
  if (name.startsWith('/') || name.startsWith('\\')) {
    throw new Error(`Invalid media file name: absolute path not allowed: ${name}`);
  }
  // Reject path traversal.
  if (name.includes('..')) {
    throw new Error(`Invalid media file name: path traversal not allowed: ${name}`);
  }
  // Reject null bytes.
  if (name.includes('\0')) {
    throw new Error(`Invalid media file name: null bytes not allowed: ${name}`);
  }
  // Reject overly long names.
  if (name.length > 255) {
    throw new Error(`Invalid media file name: exceeds 255 characters: ${name}`);
  }
  // Normalize separators to forward slash.
  return name.replace(/\\/g, '/');
}

/**
 * Compute SHA-256 hash of buffer.
 */
export function computeHash(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Validate MIME type against allowed import media types.
 */
export function isAllowedMediaType(mimeType: string): boolean {
  return IMPORT_ALLOWED_MEDIA_TYPES.includes(mimeType as typeof IMPORT_ALLOWED_MEDIA_TYPES[number]);
}
