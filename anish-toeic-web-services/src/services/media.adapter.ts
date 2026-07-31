/**
 * Media Adapter — bounded presigned upload contract.
 *
 * This adapter abstracts the storage backend (S3-compatible) behind a narrow
 * interface. It never accepts or returns base64 audio content. All audio travels
 * through the presigned URL channel between the browser and the bucket directly.
 *
 * The test adapter (createTestMediaAdapter) produces deterministic presigned
 * URLs without AWS credentials so tests never touch live buckets.
 */

export interface PresignResult {
  uploadUrl: string;
  s3Key: string;
  /** ISO-8601 expiry time of the presigned URL */
  expiresAt: string;
}

export interface PresignOptions {
  attemptId: number;
  questionId: number;
  fileName: string;
  fileType: string;
  fileSize: number;
  /** Presigned URL lifetime in seconds (default 300 = 5 minutes) */
  expiresInSeconds?: number;
}

export interface MediaAdapter {
  generatePresignedUpload(options: PresignOptions): Promise<PresignResult>;
}

/**
 * Build an AWS S3 presigned URL.
 *
 * Only instantiated when the required env vars are present
 * at runtime (AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, S3_BUCKET).
 * Falls back to a mock adapter in test/development.
 */
function buildS3Adapter(): MediaAdapter | null {
  const region = process.env.AWS_REGION;
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  const bucket = process.env.S3_BUCKET || process.env.AWS_S3_BUCKET;

  if (!region || !accessKeyId || !secretAccessKey || !bucket) {
    return null;
  }

  // Dynamically require AWS SDK to avoid crashing when credentials are absent
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

    const client = new S3Client({
      region,
      credentials: { accessKeyId, secretAccessKey },
    });

    return {
      async generatePresignedUpload(options: PresignOptions): Promise<PresignResult> {
        const expiresInSeconds = Math.min(
          Math.max(60, options.expiresInSeconds || 300),
          3600 // max 1 hour
        );

        const key = `uploads/attempts/${options.attemptId}/q${options.questionId}/${options.fileName}`;

        const command = new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          ContentType: options.fileType,
          ContentLength: options.fileSize,
          // Prevent accidental caching of signed uploads
          CacheControl: 'no-store',
        });

        const uploadUrl = await getSignedUrl(client, command, {
          expiresIn: expiresInSeconds,
        });

        const expiresAt = new Date(Date.now() + expiresInSeconds * 1000).toISOString();

        return { uploadUrl, s3Key: key, expiresAt };
      },
    };
  } catch {
    return null;
  }
}

/**
 * A deterministic test adapter that returns a mock presigned URL
 * with the correct key format. No AWS credentials needed.
 */
export function createTestMediaAdapter(): MediaAdapter {
  return {
    async generatePresignedUpload(options: PresignOptions): Promise<PresignResult> {
      const key = `uploads/attempts/${options.attemptId}/q${options.questionId}/${options.fileName}`;
      const expiresAt = new Date(Date.now() + 300 * 1000).toISOString();

      return {
        uploadUrl: `https://test-bucket.s3.test.amazonaws.com/${encodeURIComponent(key)}?X-Amz-Test-Signature=mock`,
        s3Key: key,
        expiresAt,
      };
    },
  };
}

/**
 * Singleton adapter. Priorities:
 * 1. Real S3 adapter if AWS credentials are available
 * 2. Test adapter for test/development environments
 */
let _adapter: MediaAdapter | null = null;

export function getMediaAdapter(): MediaAdapter {
  if (_adapter) return _adapter;

  if (process.env.NODE_ENV === 'production') {
    const s3Adapter = buildS3Adapter();
    if (s3Adapter) {
      _adapter = s3Adapter;
      return _adapter;
    }
    throw new Error(
      'Production environment requires AWS credentials (AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, S3_BUCKET)'
    );
  }

  // Development/test: use mock adapter
  _adapter = createTestMediaAdapter();
  return _adapter;
}

/** For testing: reset the singleton */
export function resetMediaAdapter(): void {
  _adapter = null;
}
