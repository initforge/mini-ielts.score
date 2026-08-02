import { z } from 'zod';

// Import job status enum.
export const ImportJobStatus = {
  UPLOADING: 'UPLOADING',
  INSPECTING: 'INSPECTING',
  INSPECT_FAILED: 'INSPECT_FAILED',
  FINALIZING: 'FINALIZING',
  READY: 'READY',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
} as const;

export type ImportJobStatusType = typeof ImportJobStatus[keyof typeof ImportJobStatus];

// Accepted MIME types.
export const ACCEPTED_MIME_TYPES = [
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/zip',
] as const;

// Allowed file extensions.
export const ALLOWED_EXTENSIONS = ['.docx', '.zip'] as const;

// File type validation: only accept DOCX and ZIP.
export const fileTypeSchema = z.enum(ACCEPTED_MIME_TYPES, {
  errorMap: () => ({
    message: `Invalid file type. Accepted: ${ACCEPTED_MIME_TYPES.join(', ')}`,
  }),
});

// Create import job: generates presigned upload URL.
export const createImportJobSchema = z.object({
  title: z.string().min(1).max(255),
  fileName: z.string().min(1).max(255),
  fileType: fileTypeSchema,
  fileSizeBytes: z.number().int().positive().max(100 * 1024 * 1024), // 100MB max
});

// Confirm upload: client calls after uploading to presigned URL.
export const confirmUploadSchema = z.object({
  jobId: z.number().int().positive(),
  // Expected hash for integrity verification.
  sha256Hash: z.string().length(64).regex(/^[a-f0-9]+$/),
});

// Inspect job: runs DOCX/ZIP parsing and validation.
export const inspectJobSchema = z.object({
  jobId: z.number().int().positive(),
});

// Finalize job: commits exam tree and produces READY exam.
export const finalizeJobSchema = z.object({
  jobId: z.number().int().positive(),
  collectionId: z.number().int().positive(),
  skillType: z.enum(['LR', 'SW'], {
    errorMap: () => ({ message: 'skillType must be LR or SW' }),
  }),
  durationMinutes: z.number().int().positive().max(300),
});

// Cancel job: aborts and cleans up.
export const cancelJobSchema = z.object({
  jobId: z.number().int().positive(),
});

// Pagination for listing jobs.
export const listImportJobsSchema = z.object({
  page: z.number().int().positive().optional().default(1),
  pageSize: z.number().int().min(1).max(100).optional().default(20),
  status: z.enum(Object.keys(ImportJobStatus) as [string]).optional(),
});

// Inspection result structure.
export interface InspectionResult {
  valid: boolean;
  warnings: string[];
  errors: string[];
  mediaCount: number;
  // Media validation details.
  media: Array<{
    name: string;
    type: string;
    size: number;
    hash: string;
    valid: boolean;
    error?: string;
  }>;
  // Exam structure preview.
  examPreview: {
    title: string;
    sections: number;
    questions: number;
  } | null;
}
