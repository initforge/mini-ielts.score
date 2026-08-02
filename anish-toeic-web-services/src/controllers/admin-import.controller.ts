/**
 * Admin Import Controller — handles DOCX/ZIP import job API endpoints.
 *
 * Workflow: POST create → POST confirm-upload → POST inspect → POST finalize | DELETE cancel
 * All operations require EXAM_EDITOR capability.
 */

import { Request, Response } from 'express';
import { AdminImportService } from '../services/admin-import.service';
import {
  createImportJobSchema,
  confirmUploadSchema,
  finalizeJobSchema,
  listImportJobsSchema,
  ImportJobStatusType,
} from '../validations/admin-import.validation';
import { HttpError } from '../errors/http.error';

function getUserId(req: Request): number {
  const userId = req.user?.id;
  if (!userId) throw new HttpError(401, 'Unauthorized');
  return typeof userId === 'string' ? parseInt(userId, 10) : userId;
}

function sendError(res: Response, err: unknown) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message });
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((err as any)?.name === 'ZodError') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return res.status(400).json({ error: (err as any).errors });
  }
  console.error('[admin-import] request failed:', err);
  return res.status(500).json({ error: 'Internal server error' });
}

export class AdminImportController {
  /**
   * POST /api/admin/import/jobs
   * Create import job and get presigned upload URL.
   * Requires EXAM_EDITOR capability.
   */
  static async createJob(req: Request, res: Response) {
    try {
      const userId = getUserId(req);
      const validated = createImportJobSchema.parse(req.body);

      const result = await AdminImportService.createJob(
        {
          title: validated.title,
          fileName: validated.fileName,
          fileType: validated.fileType,
          fileSizeBytes: validated.fileSizeBytes,
        },
        userId
      );

      res.status(201).json({
        jobId: result.jobId,
        uploadUrl: result.uploadUrl,
        s3Key: result.s3Key,
        expiresAt: result.expiresAt,
      });
    } catch (err: unknown) {
      sendError(res, err);
    }
  }

  /**
   * POST /api/admin/import/jobs/:id/confirm-upload
   * Confirm upload and trigger inspection.
   * File is retrieved from S3/MinIO using the job's server-controlled storage key.
   */
  static async confirmUpload(req: Request, res: Response) {
    try {
      const userId = getUserId(req);
      const jobId = parseInt(req.params.id, 10);
      if (!Number.isInteger(jobId) || jobId <= 0) {
        return res.status(400).json({ error: 'Invalid job ID' });
      }

      const validated = confirmUploadSchema.parse({ ...req.body, jobId });

      await AdminImportService.confirmUpload(validated.jobId, validated.sha256Hash, userId);
      res.json({ success: true, jobId: validated.jobId });
    } catch (err: unknown) {
      sendError(res, err);
    }
  }

  /**
   * POST /api/admin/import/jobs/:id/inspect
   * Inspect DOCX/ZIP content and validate.
   * File is retrieved from S3/MinIO using the job's server-controlled storage key.
   */
  static async inspectJob(req: Request, res: Response) {
    try {
      const userId = getUserId(req);
      const jobId = parseInt(req.params.id, 10);
      if (!Number.isInteger(jobId) || jobId <= 0) {
        return res.status(400).json({ error: 'Invalid job ID' });
      }

      const result = await AdminImportService.inspectJob(jobId, userId);
      res.json(result);
    } catch (err: unknown) {
      sendError(res, err);
    }
  }

  /**
   * POST /api/admin/import/jobs/:id/finalize
   * Finalize job and produce READY exam.
   */
  static async finalizeJob(req: Request, res: Response) {
    try {
      const userId = getUserId(req);
      const jobId = parseInt(req.params.id, 10);
      if (!Number.isInteger(jobId) || jobId <= 0) {
        return res.status(400).json({ error: 'Invalid job ID' });
      }

      const validated = finalizeJobSchema.parse({ ...req.body, jobId });

      const result = await AdminImportService.finalizeJob(
        validated.jobId,
        validated.collectionId,
        validated.skillType,
        validated.durationMinutes,
        userId
      );

      res.json({ success: true, examId: result.examId });
    } catch (err: unknown) {
      sendError(res, err);
    }
  }

  /**
   * DELETE /api/admin/import/jobs/:id
   * Cancel import job.
   */
  static async cancelJob(req: Request, res: Response) {
    try {
      const userId = getUserId(req);
      const jobId = parseInt(req.params.id, 10);
      if (!Number.isInteger(jobId) || jobId <= 0) {
        return res.status(400).json({ error: 'Invalid job ID' });
      }

      await AdminImportService.cancelJob(jobId, userId);
      res.json({ success: true, jobId });
    } catch (err: unknown) {
      sendError(res, err);
    }
  }

  /**
   * GET /api/admin/import/jobs
   * List import jobs with pagination.
   */
  static async listJobs(req: Request, res: Response) {
    try {
      const validated = listImportJobsSchema.parse(req.query);
      const result = await AdminImportService.listJobs({
        page: validated.page,
        pageSize: validated.pageSize,
        status: validated.status as ImportJobStatusType,
      });
      res.json(result);
    } catch (err: unknown) {
      sendError(res, err);
    }
  }

  /**
   * GET /api/admin/import/jobs/:id
   * Get single import job.
   */
  static async getJob(req: Request, res: Response) {
    try {
      const jobId = parseInt(req.params.id, 10);
      if (!Number.isInteger(jobId) || jobId <= 0) {
        return res.status(400).json({ error: 'Invalid job ID' });
      }

      const job = await AdminImportService.getJob(jobId);
      if (!job) {
        return res.status(404).json({ error: 'Import job not found' });
      }
      res.json(job);
    } catch (err: unknown) {
      sendError(res, err);
    }
  }
}
