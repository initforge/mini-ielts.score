/**
 * Admin Import Service — import job lifecycle management.
 *
 * Workflow: create (presigned URL) → confirm upload → inspect → finalize | cancel
 * All transitions are transactional; no partial exam tree on failure.
 * Domain separation: DOCX package not recorded/listening; import media asset tags.
 */

import { pool } from './db.service';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { HttpError, notFound, forbidden, conflict } from '../errors/http.error';
import { inspectArchive, verifyHash, validateExtensionMimeMatch } from './docx-import.service';
import { getImportMediaAdapter } from './import-media.adapter';
import type { InspectionResult } from '../validations/admin-import.validation';
import type { ImportJobStatusType } from '../validations/admin-import.validation';
import { ImportJobStatus, ACCEPTED_MIME_TYPES } from '../validations/admin-import.validation';

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
  cancelledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface ImportJobRow extends RowDataPacket {
  id: number;
  title: string;
  file_name: string;
  file_type: string;
  file_size_bytes: number;
  domain_tag: string;
  s3_prefix: string;
  status: ImportJobStatusType;
  status_message: string | null;
  inspection_result: string | null;
  actor_user_id: number;
  produced_exam_id: number | null;
  cancelled_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

// Valid state transitions.
const VALID_TRANSITIONS: Record<ImportJobStatusType, ImportJobStatusType[]> = {
  UPLOADING: ['INSPECTING', 'CANCELLED'],
  INSPECTING: ['INSPECT_FAILED', 'FINALIZING'],
  INSPECT_FAILED: ['INSPECTING', 'CANCELLED'],
  FINALIZING: ['READY', 'FAILED'],
  READY: [], // Terminal
  FAILED: ['INSPECTING', 'CANCELLED'], // Allow retry or cancel
  CANCELLED: [], // Terminal
};

function validateTransition(current: ImportJobStatusType, next: ImportJobStatusType): void {
  const allowed = VALID_TRANSITIONS[current];
  if (!allowed.includes(next)) {
    throw conflict(`Invalid status transition: ${current} → ${next}`);
  }
}

function mapRow(row: ImportJobRow): ImportJob {
  return {
    id: row.id,
    title: row.title,
    fileName: row.file_name,
    fileType: row.file_type,
    fileSizeBytes: row.file_size_bytes,
    domainTag: row.domain_tag,
    s3Prefix: row.s3_prefix,
    status: row.status,
    statusMessage: row.status_message,
    inspectionResult: row.inspection_result ? JSON.parse(row.inspection_result) : null,
    actorUserId: row.actor_user_id,
    producedExamId: row.produced_exam_id,
    cancelledAt: row.cancelled_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class AdminImportService {
  /**
   * Create import job and generate presigned upload URL.
   * Job starts in UPLOADING status.
   */
  static async createJob(
    input: {
      title: string;
      fileName: string;
      fileType: string;
      fileSizeBytes: number;
    },
    actorUserId: number
  ): Promise<{ jobId: number; uploadUrl: string; s3Key: string; expiresAt: string }> {
    // Validate file type.
    if (!ACCEPTED_MIME_TYPES.includes(input.fileType as typeof ACCEPTED_MIME_TYPES[number])) {
      throw new HttpError(400, `Invalid file type: ${input.fileType}`);
    }

    // Validate extension matches MIME type.
    if (!validateExtensionMimeMatch(input.fileName, input.fileType)) {
      throw new HttpError(400, 'File extension does not match MIME type');
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // Generate job ID first (for S3 prefix).
      const [insertResult] = await connection.query<ResultSetHeader>(
        `INSERT INTO import_jobs
         (title, file_name, file_type, file_size_bytes, domain_tag, s3_prefix, status, actor_user_id)
         VALUES (?, ?, ?, ?, 'import-media', '', 'UPLOADING', ?)`,
        [input.title, input.fileName, input.fileType, input.fileSizeBytes, actorUserId]
      );

      const jobId = insertResult.insertId;
      const s3Prefix = `import-media/jobs/${jobId}/`;

      // Update S3 prefix.
      await connection.query(
        'UPDATE import_jobs SET s3_prefix = ? WHERE id = ?',
        [s3Prefix, jobId]
      );

      // Audit log.
      await connection.query(
        `INSERT INTO import_audit_log (import_job_id, action, actor_user_id, details)
         VALUES (?, 'CREATE', ?, ?)`,
        [jobId, actorUserId, JSON.stringify({ title: input.title, fileName: input.fileName, fileType: input.fileType })]
      );

      await connection.commit();

      // Generate presigned URL.
      const adapter = getImportMediaAdapter();
      const presignResult = await adapter.generatePresignedUpload({
        jobId,
        fileName: input.fileName,
        fileType: input.fileType,
        fileSize: input.fileSizeBytes,
      });

      return {
        jobId,
        uploadUrl: presignResult.uploadUrl,
        s3Key: presignResult.s3Key,
        expiresAt: presignResult.expiresAt,
      };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * Retrieve file buffer from storage using the job's S3 key.
   * Server-controlled retrieval — no user-controlled key.
   */
  private static async retrieveFileFromStorage(s3Key: string): Promise<Buffer> {
    const adapter = getImportMediaAdapter();
    return adapter.retrieveFile(s3Key);
  }

  /**
   * Confirm upload: verify hash and transition to INSPECTING.
   * File is retrieved from S3/MinIO using the job's server-controlled storage key.
   */
  static async confirmUpload(
    jobId: number,
    sha256Hash: string,
    actorUserId: number
  ): Promise<void> {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // Lock job row.
      const [rows] = await connection.query<ImportJobRow[]>(
        'SELECT * FROM import_jobs WHERE id = ? FOR UPDATE',
        [jobId]
      );

      if (!rows.length) {
        await connection.rollback();
        throw notFound(`Import job ${jobId} not found`);
      }

      const job = rows[0];

      // Verify actor.
      if (job.actor_user_id !== actorUserId) {
        await connection.rollback();
        throw forbidden('Not authorized to modify this import job');
      }

      // Retrieve file from storage using server-controlled s3Key.
      const uploadedBuffer = await this.retrieveFileFromStorage(job.s3_prefix);

      // Verify hash.
      if (!verifyHash(uploadedBuffer, sha256Hash)) {
        await connection.rollback();
        throw new HttpError(400, 'File hash verification failed');
      }

      // Verify file type.
      if (!validateExtensionMimeMatch(job.file_name, job.file_type)) {
        await connection.rollback();
        throw new HttpError(400, 'File extension does not match stored MIME type');
      }

      // Transition to INSPECTING.
      validateTransition(job.status as ImportJobStatusType, ImportJobStatus.INSPECTING);
      await connection.query(
        'UPDATE import_jobs SET status = ? WHERE id = ?',
        [ImportJobStatus.INSPECTING, jobId]
      );

      // Audit.
      await connection.query(
        `INSERT INTO import_audit_log (import_job_id, action, actor_user_id, details)
         VALUES (?, 'CONFIRM_UPLOAD', ?, ?)`,
        [jobId, actorUserId, JSON.stringify({ hash: sha256Hash })]
      );

      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * Inspect job: parse DOCX/ZIP and validate.
   * File is retrieved from S3/MinIO using the job's server-controlled storage key.
   * Updates job with inspection result.
   */
  static async inspectJob(jobId: number, actorUserId: number): Promise<InspectionResult> {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // Lock and verify job status.
      const [rows] = await connection.query<ImportJobRow[]>(
        'SELECT * FROM import_jobs WHERE id = ? FOR UPDATE',
        [jobId]
      );

      if (!rows.length) {
        await connection.rollback();
        throw notFound(`Import job ${jobId} not found`);
      }

      const job = rows[0];

      if (job.actor_user_id !== actorUserId) {
        await connection.rollback();
        throw forbidden('Not authorized to modify this import job');
      }

      if (job.status !== ImportJobStatus.INSPECTING) {
        await connection.rollback();
        throw conflict(`Job must be in INSPECTING status, current: ${job.status}`);
      }

      // Retrieve file from storage using server-controlled s3Key.
      const fileBuffer = await this.retrieveFileFromStorage(job.s3_prefix);

      // Strict object bounds before buffer parse.
      if (fileBuffer.length === 0) {
        await connection.rollback();
        throw new HttpError(400, 'Empty file buffer');
      }
      if (fileBuffer.length > 100 * 1024 * 1024) {
        await connection.rollback();
        throw new HttpError(400, 'File exceeds maximum allowed size');
      }

      // Run inspection.
      const result = await inspectArchive(fileBuffer, job.file_type, job.file_name);

      // Update job with inspection result.
      const newStatus = result.valid ? ImportJobStatus.INSPECTING : ImportJobStatus.INSPECT_FAILED;
      await connection.query(
        `UPDATE import_jobs
         SET status = ?, status_message = ?, inspection_result = ?
         WHERE id = ?`,
        [newStatus, result.errors.join('; ') || null, JSON.stringify(result), jobId]
      );

      // Audit.
      await connection.query(
        `INSERT INTO import_audit_log (import_job_id, action, actor_user_id, details)
         VALUES (?, 'INSPECT', ?, ?)`,
        [jobId, actorUserId, JSON.stringify({ valid: result.valid, mediaCount: result.mediaCount, errorCount: result.errors.length })]
      );

      await connection.commit();
      return result;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * Finalize job: create exam tree and transition to READY.
   * Transaction ensures atomicity — no partial tree on failure.
   */
  static async finalizeJob(
    jobId: number,
    collectionId: number,
    skillType: string,
    durationMinutes: number,
    actorUserId: number
  ): Promise<{ examId: number }> {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // Lock and verify job status.
      const [rows] = await connection.query<ImportJobRow[]>(
        'SELECT * FROM import_jobs WHERE id = ? FOR UPDATE',
        [jobId]
      );

      if (!rows.length) {
        await connection.rollback();
        throw notFound(`Import job ${jobId} not found`);
      }

      const job = rows[0];

      if (job.actor_user_id !== actorUserId) {
        await connection.rollback();
        throw forbidden('Not authorized to modify this import job');
      }

      if (job.status !== ImportJobStatus.INSPECTING) {
        await connection.rollback();
        throw conflict(`Job must be in INSPECTING status (after successful inspection), current: ${job.status}`);
      }

      // Parse inspection result.
      const inspection = job.inspection_result
        ? (typeof job.inspection_result === 'string' ? JSON.parse(job.inspection_result) : job.inspection_result)
        : null;

      if (!inspection || !inspection.valid) {
        await connection.rollback();
        throw conflict('Cannot finalize job with failed inspection');
      }

      // Generate slug from title.
      const baseSlug = job.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const slug = `${baseSlug}-${Date.now()}`;

      // Transition to FINALIZING.
      validateTransition(job.status as ImportJobStatusType, ImportJobStatus.FINALIZING);
      await connection.query(
        'UPDATE import_jobs SET status = ? WHERE id = ?',
        [ImportJobStatus.FINALIZING, jobId]
      );

      // Create exam (DRAFT).
      const [examResult] = await connection.query<ResultSetHeader>(
        `INSERT INTO toeic_exams
         (collection_id, slug, title, duration_minutes, question_count, skill_type, status, version, is_mixed)
         VALUES (?, ?, ?, ?, ?, ?, 'DRAFT', 1, FALSE)`,
        [collectionId, slug, job.title, durationMinutes, 0, skillType]
      );

      const examId = examResult.insertId;

      // ponytail: Full DOCX parsing and section/question creation would go here.
      // For now, create a single section as placeholder.
      // TODO: Implement DOCX XML parsing for full exam tree creation.
      await connection.query(
        `INSERT INTO toeic_exam_sections (exam_id, title, instructions, order_index)
         VALUES (?, ?, ?, ?)`,
        [examId, 'Section 1', 'Imported section', 0]
      );

      // Update job to READY.
      await connection.query(
        `UPDATE import_jobs
         SET status = ?, produced_exam_id = ?, status_message = ?
         WHERE id = ?`,
        [ImportJobStatus.READY, examId, 'Import finalized', jobId]
      );

      // Audit.
      await connection.query(
        `INSERT INTO import_audit_log (import_job_id, action, actor_user_id, details)
         VALUES (?, 'FINALIZE', ?, ?)`,
        [jobId, actorUserId, JSON.stringify({ examId, collectionId, skillType, mediaCount: inspection.mediaCount })]
      );

      await connection.commit();
      return { examId };
    } catch (error) {
      // On failure, transition to FAILED.
      try {
        await connection.query(
          'UPDATE import_jobs SET status = ?, status_message = ? WHERE id = ?',
          [ImportJobStatus.FAILED, error instanceof Error ? error.message : 'Unknown error', jobId]
        );
        await connection.query(
          `INSERT INTO import_audit_log (import_job_id, action, actor_user_id, details)
           VALUES (?, 'FAIL', ?, ?)`,
          [jobId, actorUserId, JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown' })]
        );
      } catch {
        // Ignore audit log errors during rollback.
      }
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * Cancel job: abort and clean up.
   * No partial tree is created — transaction ensures atomicity.
   */
  static async cancelJob(jobId: number, actorUserId: number): Promise<void> {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // Lock and verify job.
      const [rows] = await connection.query<ImportJobRow[]>(
        'SELECT * FROM import_jobs WHERE id = ? FOR UPDATE',
        [jobId]
      );

      if (!rows.length) {
        await connection.rollback();
        throw notFound(`Import job ${jobId} not found`);
      }

      const job = rows[0];

      if (job.actor_user_id !== actorUserId) {
        await connection.rollback();
        throw forbidden('Not authorized to modify this import job');
      }

      if (job.status === ImportJobStatus.READY) {
        await connection.rollback();
        throw conflict('Cannot cancel a READY job');
      }

      // Transition to CANCELLED.
      validateTransition(job.status as ImportJobStatusType, ImportJobStatus.CANCELLED);
      await connection.query(
        'UPDATE import_jobs SET status = ?, cancelled_at = NOW(), status_message = ? WHERE id = ?',
        [ImportJobStatus.CANCELLED, 'Cancelled by user', jobId]
      );

      // Audit.
      await connection.query(
        `INSERT INTO import_audit_log (import_job_id, action, actor_user_id, details)
         VALUES (?, 'CANCEL', ?, ?)`,
        [jobId, actorUserId, JSON.stringify({ previousStatus: job.status })]
      );

      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * Get import job by ID.
   */
  static async getJob(jobId: number): Promise<ImportJob | null> {
    const [rows] = await pool.query<ImportJobRow[]>(
      'SELECT * FROM import_jobs WHERE id = ?',
      [jobId]
    );

    if (!rows.length) return null;
    return mapRow(rows[0]);
  }

  /**
   * List import jobs with pagination.
   */
  static async listJobs(filters: {
    page?: number;
    pageSize?: number;
    status?: ImportJobStatusType;
  }): Promise<{ items: ImportJob[]; total: number; page: number; pageSize: number }> {
    const page = Math.max(1, filters.page || 1);
    const pageSize = Math.min(100, Math.max(1, filters.pageSize || 20));
    const offset = (page - 1) * pageSize;

    let whereClause = '';
    const params: (number | string)[] = [];

    if (filters.status) {
      whereClause = 'WHERE status = ?';
      params.push(filters.status);
    }

    const [countRows] = await pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS total FROM import_jobs ${whereClause}`,
      params
    );
    const total = Number(countRows[0]?.total || 0);

    const [rows] = await pool.query<ImportJobRow[]>(
      `SELECT * FROM import_jobs ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );

    return {
      items: rows.map(mapRow),
      total,
      page,
      pageSize,
    };
  }
}
