// Admin import job API types mirroring backend contracts.

export const ImportJobStatus = {
  UPLOADING: 'UPLOADING',
  INSPECTING: 'INSPECTING',
  INSPECT_FAILED: 'INSPECT_FAILED',
  FINALIZING: 'FINALIZING',
  READY: 'READY',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
} as const;

export type ImportJobStatusType = (typeof ImportJobStatus)[keyof typeof ImportJobStatus];

export interface InspectionMedia {
  name: string;
  type: string;
  size: number;
  hash: string;
  valid: boolean;
  error?: string;
}

export interface ExamPreview {
  title: string;
  sections: number;
  questions: number;
}

export interface InspectionResult {
  valid: boolean;
  warnings: string[];
  errors: string[];
  mediaCount: number;
  media: InspectionMedia[];
  examPreview: ExamPreview | null;
}

export interface ImportJob {
  id: number;
  title: string;
  fileName: string;
  fileType: string;
  fileSizeBytes: number;
  domainTag: string;
  s3Prefix: string;
  status: ImportJobStatusType;
  statusMessage: string | null;
  inspectionResult: InspectionResult | null;
  actorUserId: number;
  producedExamId: number | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ImportJobListResponse {
  items: ImportJob[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CreateJobResponse {
  jobId: number;
  uploadUrl: string;
  s3Key: string;
  expiresAt: string;
}

export interface ConfirmUploadResponse {
  success: boolean;
  jobId: number;
}

export interface FinalizeJobResponse {
  success: boolean;
  examId: number;
}

export interface CancelJobResponse {
  success: boolean;
  jobId: number;
}
