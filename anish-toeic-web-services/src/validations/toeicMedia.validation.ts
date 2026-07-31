import { z } from 'zod';

// Allowed audio MIME types for S&W recording uploads
const ALLOWED_AUDIO_MIME_TYPES = [
  'audio/webm',
  'audio/webm;codecs=opus',
  'audio/webm;codecs=pcm',
  'audio/mp4',
  'audio/mpeg',
  'audio/wav',
  'audio/wave',
  'audio/ogg',
  'audio/ogg;codecs=opus',
  'audio/x-m4a',
  'audio/3gpp',
] as const;

// Maximum recording file size: 25 MB (matches common S3 presign limits)
export const MAX_MEDIA_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB

// File name pattern: allow alphanumeric, hyphen, underscore, single dot before extension.
// No path separators, no double dots, no leading dots.
const SAFE_FILE_NAME_RE = /^[a-zA-Z0-9][\w.-]*\.(webm|mp4|mp3|wav|ogg|m4a|3gp|opus)$/;

// Detect base64-encoded content in request bodies.
// Reject any string that looks like a base64 data URI or raw base64 blob (> 100 chars of base64).
const BASE64_PATTERN_RE = /^(data:[^;]*;base64,|[A-Za-z0-9+/]{100,}={0,2}$)/;

export const presignMediaSchema = z.object({
  questionId: z
    .number()
    .int()
    .positive('questionId must be a positive integer'),
  fileName: z
    .string()
    .min(1, 'fileName is required')
    .max(255, 'fileName must be at most 255 characters')
    .regex(SAFE_FILE_NAME_RE, 'fileName must be a safe audio file name (e.g., recording.webm) without path separators'),
  fileType: z
    .string()
    .min(1, 'fileType is required')
    .max(100, 'fileType must be at most 100 characters')
    .refine(
      (val) => ALLOWED_AUDIO_MIME_TYPES.some((allowed) => val.toLowerCase() === allowed.toLowerCase()),
      { message: 'fileType must be an allowed audio MIME type' }
    ),
  fileSize: z
    .number()
    .int()
    .positive('fileSize must be a positive integer')
    .max(MAX_MEDIA_FILE_SIZE_BYTES, `fileSize must not exceed ${MAX_MEDIA_FILE_SIZE_BYTES} bytes`),
  // Explicitly reject base64 payloads in the request body.
  // We use refine on the whole object since z.never() cannot take a custom message in Zod 3.
  content: z.string().optional(),
}).refine(
  (data) => !data.content || !isBase64Like(data.content),
  { message: 'base64 audio content must not be sent in request body — use presigned S3 upload', path: ['content'] }
).refine(
  (data) => !isBase64Like(data.fileName) && !isBase64Like(data.fileType),
  { message: 'base64-encoded data detected in request body — use presigned S3 upload', path: [] }
);

// Detect base64 data URIs or raw base64 strings (100+ chars of base64 characters)
function isBase64Like(value: string): boolean {
  if (value.startsWith('data:') && value.includes(';base64,')) return true;
  // Raw base64 string: 100+ chars of A-Za-z0-9+/=
  if (value.length >= 100 && /^[A-Za-z0-9+/]{100,}=*$/.test(value)) return true;
  return false;
}

export type PresignMediaInput = z.infer<typeof presignMediaSchema>;

/**
 * Detect if a request body contains base64-encoded audio data.
 * Returns true if base64 audio is suspected.
 */
export function containsBase64Audio(body: Record<string, unknown>): boolean {
  for (const value of Object.values(body)) {
    if (typeof value === 'string' && BASE64_PATTERN_RE.test(value)) {
      return true;
    }
  }
  return false;
}

/**
 * Validate the raw body before Zod parsing to catch base64 attempts early.
 * Throws a Zod-like error so the controller can catch it uniformly.
 */
export function validateNoBase64(body: unknown): void {
  if (typeof body !== 'object' || body === null) return;
  const record = body as Record<string, unknown>;

  // Check for 'content' key with base64 data (most common leak vector)
  if (typeof record.content === 'string' && BASE64_PATTERN_RE.test(record.content)) {
    throw Object.assign(new Error('base64 audio content must not be sent in request body — use presigned S3 upload'), {
      name: 'ZodError',
      errors: [{ path: ['content'], message: 'base64 audio content must not be sent in request body — use presigned S3 upload' }],
    });
  }

  // Check other string fields for base64 patterns
  if (containsBase64Audio(record)) {
    throw Object.assign(new Error('base64-encoded data detected in request body — use presigned S3 upload'), {
      name: 'ZodError',
      errors: [{ path: [], message: 'base64-encoded data detected in request body — use presigned S3 upload' }],
    });
  }
}

/**
 * Sanitize a file name by stripping any path components and extra dots.
 * Returns the safe base name with only extension preserved.
 */
export function sanitizeFileName(raw: string): string {
  // Strip any directory path separators
  const base = raw.replace(/^.*[/\\]/, '');
  // Remove any characters that aren't safe
  const sanitized = base.replace(/[^a-zA-Z0-9._-]/g, '');
  // Collapse multiple dots to a single one before extension
  const parts = sanitized.split('.');
  if (parts.length <= 1) return sanitized;
  const ext = parts.pop()!;
  const name = parts.join('_');
  return `${name}.${ext}`;
}
