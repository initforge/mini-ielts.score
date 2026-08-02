import { Request, Response } from 'express';
import { AdminResultService } from '../services/admin-result.service';
import { resultFiltersSchema, regradeSchema, overrideSchema, restoreSchema } from '../validations/admin-result.validation';
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
  console.error('[admin-result] request failed:', err);
  return res.status(500).json({ error: 'Internal server error' });
}

export class AdminResultController {
  /** GET /api/admin/results - List results with filtering */
  static async list(req: Request, res: Response) {
    try {
      getUserId(req);
      // Capability check already done by requireResultManager middleware

      const query = {
        examId: req.query.examId ? parseInt(req.query.examId as string, 10) : undefined,
        userId: req.query.userId as string | undefined,
        status: req.query.status as string | undefined,
        minScore: req.query.minScore ? parseInt(req.query.minScore as string, 10) : undefined,
        maxScore: req.query.maxScore ? parseInt(req.query.maxScore as string, 10) : undefined,
        page: req.query.page ? parseInt(req.query.page as string, 10) : undefined,
        pageSize: req.query.pageSize ? parseInt(req.query.pageSize as string, 10) : undefined,
      };

      const validated = resultFiltersSchema.parse(query);
      const result = await AdminResultService.listResults(validated);
      res.json(result);
    } catch (err: unknown) {
      sendError(res, err);
    }
  }

  /** GET /api/admin/results/:attemptId - Get result detail */
  static async getDetail(req: Request, res: Response) {
    try {
      getUserId(req);
      // Capability check already done by requireResultManager middleware

      const attemptId = parseInt(req.params.attemptId, 10);
      if (!Number.isInteger(attemptId) || attemptId <= 0) {
        return res.status(400).json({ error: 'Invalid attempt id' });
      }

      const result = await AdminResultService.getResultDetail(attemptId);
      if (!result) return res.status(404).json({ error: 'Result not found' });
      res.json(result);
    } catch (err: unknown) {
      sendError(res, err);
    }
  }

  /** POST /api/admin/results/:attemptId/regrade - Regrade attempt */
  static async regrade(req: Request, res: Response) {
    try {
      const userId = getUserId(req);
      // Capability check already done by requireResultManager middleware

      const attemptId = parseInt(req.params.attemptId, 10);
      if (!Number.isInteger(attemptId) || attemptId <= 0) {
        return res.status(400).json({ error: 'Invalid attempt id' });
      }

      const validated = regradeSchema.parse(req.body);
      const result = await AdminResultService.regrade({ ...validated, attemptId }, userId);
      res.json(result);
    } catch (err: unknown) {
      sendError(res, err);
    }
  }

  /** POST /api/admin/results/:attemptId/override - Override scores */
  static async override(req: Request, res: Response) {
    try {
      const userId = getUserId(req);
      // Capability check already done by requireResultManager middleware

      const attemptId = parseInt(req.params.attemptId, 10);
      if (!Number.isInteger(attemptId) || attemptId <= 0) {
        return res.status(400).json({ error: 'Invalid attempt id' });
      }

      const validated = overrideSchema.parse(req.body);
      const result = await AdminResultService.override({ ...validated, attemptId }, userId);
      res.json(result);
    } catch (err: unknown) {
      sendError(res, err);
    }
  }

  /** POST /api/admin/results/:attemptId/restore - Restore to snapshot version */
  static async restore(req: Request, res: Response) {
    try {
      const userId = getUserId(req);
      // Capability check already done by requireResultManager middleware

      const attemptId = parseInt(req.params.attemptId, 10);
      if (!Number.isInteger(attemptId) || attemptId <= 0) {
        return res.status(400).json({ error: 'Invalid attempt id' });
      }

      const validated = restoreSchema.parse(req.body);
      const result = await AdminResultService.restore({ ...validated, attemptId }, userId);
      res.json(result);
    } catch (err: unknown) {
      sendError(res, err);
    }
  }

  /** GET /api/admin/results/:attemptId/audit - Get result audit log */
  static async getAuditLog(req: Request, res: Response) {
    try {
      getUserId(req);
      // Capability check already done by requireAuditor middleware

      const attemptId = parseInt(req.params.attemptId, 10);
      if (!Number.isInteger(attemptId) || attemptId <= 0) {
        return res.status(400).json({ error: 'Invalid attempt id' });
      }

      const log = await AdminResultService.getResultAuditLog(attemptId);
      res.json(log);
    } catch (err: unknown) {
      sendError(res, err);
    }
  }
}
