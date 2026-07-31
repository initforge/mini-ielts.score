import { z } from 'zod';

export const createAttemptSchema = z.object({
  mode: z.enum(['EXAM', 'PRACTICE']),
});

export const updateResponseSchema = z.object({
  selectedOptionId: z.number().int().positive().nullable().optional(),
  textResponse: z.string().max(10000).nullable().optional(),
  markedForReview: z.boolean().optional(),
  note: z.string().max(5000).nullable().optional(),
  clientRevision: z.number().int().min(0, 'clientRevision must be >= 0').optional(),
});

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

const SAFE_AUDIO_FILE_NAME_RE =
  /^[a-zA-Z0-9][\w.-]*\.(webm|mp4|mp3|wav|ogg|m4a|3gp|opus)$/;

export const MAX_MEDIA_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB

export const presignMediaSchema = z.object({
  questionId: z.number().int().positive(),
  fileName: z
    .string()
    .min(1)
    .max(255)
    .regex(SAFE_AUDIO_FILE_NAME_RE, 'fileName must be a safe audio file name (e.g., recording.webm) without path separators'),
  fileType: z
    .string()
    .min(1)
    .max(100)
    .refine(
      (val) => ALLOWED_AUDIO_MIME_TYPES.some((allowed) => allowed.toLowerCase() === val.toLowerCase()),
      { message: 'fileType must be an allowed audio MIME type' }
    ),
  fileSize: z
    .number()
    .int()
    .positive()
    .max(MAX_MEDIA_FILE_SIZE_BYTES, `fileSize must not exceed ${MAX_MEDIA_FILE_SIZE_BYTES} bytes`),
  // Explicitly reject base64 audio data in request body.
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

export const catalogQuerySchema = z.object({
  search: z.string().trim().max(255).optional(),
  skillType: z.enum(['LR', 'SW']).optional(),
  collectionId: z
    .string()
    .regex(/^\d+$/, 'collectionId must be numeric')
    .optional(),
  page: z
    .string()
    .regex(/^\d+$/, 'page must be numeric')
    .optional(),
  pageSize: z
    .string()
    .regex(/^\d+$/, 'pageSize must be numeric')
    .optional(),
});
