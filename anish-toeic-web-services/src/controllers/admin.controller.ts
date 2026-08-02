import { Request, Response } from 'express';
import { AdminService } from '../services/admin.service';
import { lifecycleSchema } from '../validations/admin.validation';
import { HttpError } from '../errors/http.error';

function getUserId(req: Request): string {
  const userId = req.user?.id;
  if (!userId) throw new HttpError(401, 'Unauthorized');
  return userId;
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
  console.error('[admin] request failed:', err);
  return res.status(500).json({ error: 'Internal server error' });
}

export class AdminController {
  static async getExams(req: Request, res: Response) {
    try {
      const page = req.query.page ? parseInt(req.query.page as string, 10) : undefined;
      const pageSize = req.query.pageSize ? parseInt(req.query.pageSize as string, 10) : undefined;
      const result = await AdminService.getExams({ page, pageSize });
      res.json(result);
    } catch (err: unknown) {
      sendError(res, err);
    }
  }

  static async publishArchive(req: Request, res: Response) {
    try {
      const userId = getUserId(req);
      const examId = parseInt(req.params.id, 10);
      if (!Number.isInteger(examId) || examId <= 0) {
        return res.status(400).json({ error: 'Invalid exam id' });
      }
      const validated = lifecycleSchema.parse(req.body);

      const result = await AdminService.publishArchive(examId, userId, validated.status, validated.expectedVersion);
      res.json(result);
    } catch (err: unknown) {
      sendError(res, err);
    }
  }

  static async getSnapshot(req: Request, res: Response) {
    try {
      const examId = parseInt(req.params.id, 10);
      if (!Number.isInteger(examId) || examId <= 0) {
        return res.status(400).json({ error: 'Invalid exam id' });
      }

      const snapshot = await AdminService.getSnapshot(examId);
      if (!snapshot) return res.status(404).json({ error: 'Snapshot not found' });
      res.json(snapshot);
    } catch (err: unknown) {
      sendError(res, err);
    }
  }

  static async getAuditLog(req: Request, res: Response) {
    try {
      const examId = req.query.examId
        ? parseInt(req.query.examId as string, 10)
        : undefined;
      const log = await AdminService.getAuditLog(examId);
      res.json(log);
    } catch (err: unknown) {
      sendError(res, err);
    }
  }
}
