import { Request, Response } from 'express';
import { AdminMixedExamService } from '../services/admin-mixed-exam.service';
import { mixedExamCreateSchema, mixedExamUpdateSourcesSchema } from '../validations/admin-mixed-exam.validation';
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
  console.error('[admin-mixed-exam] request failed:', err);
  return res.status(500).json({ error: 'Internal server error' });
}

export class AdminMixedExamController {
  /** POST /api/admin/mixed-exams - Create a new mixed exam */
  static async create(req: Request, res: Response) {
    try {
      const userId = getUserId(req);
      // Capability check already done by requireExamEditor middleware

      const validated = mixedExamCreateSchema.parse(req.body);
      const result = await AdminMixedExamService.createMixedExam(validated, userId);
      res.status(201).json(result);
    } catch (err: unknown) {
      sendError(res, err);
    }
  }

  /** GET /api/admin/mixed-exams/:id - Get mixed exam with sources */
  static async get(req: Request, res: Response) {
    try {
      getUserId(req);
      // Capability check already done by requireExamEditor middleware

      const examId = parseInt(req.params.id, 10);
      if (!Number.isInteger(examId) || examId <= 0) {
        return res.status(400).json({ error: 'Invalid exam id' });
      }

      const exam = await AdminMixedExamService.getMixedExam(examId);
      if (!exam) return res.status(404).json({ error: 'Mixed exam not found' });
      res.json(exam);
    } catch (err: unknown) {
      sendError(res, err);
    }
  }

  /** PATCH /api/admin/mixed-exams/:id/sources - Update sources (DRAFT only) */
  static async updateSources(req: Request, res: Response) {
    try {
      const userId = getUserId(req);
      // Capability check already done by requireExamEditor middleware

      const examId = parseInt(req.params.id, 10);
      if (!Number.isInteger(examId) || examId <= 0) {
        return res.status(400).json({ error: 'Invalid exam id' });
      }

      const validated = mixedExamUpdateSourcesSchema.parse(req.body);
      await AdminMixedExamService.updateSources(examId, validated.sources, userId);
      res.json({ success: true });
    } catch (err: unknown) {
      sendError(res, err);
    }
  }

  /** POST /api/admin/mixed-exams/:id/publish - Publish mixed exam */
  static async publish(req: Request, res: Response) {
    try {
      const userId = getUserId(req);
      // Capability check already done by requireExamEditor middleware

      const examId = parseInt(req.params.id, 10);
      if (!Number.isInteger(examId) || examId <= 0) {
        return res.status(400).json({ error: 'Invalid exam id' });
      }

      const result = await AdminMixedExamService.publishMixedExam(examId, userId);
      res.json(result);
    } catch (err: unknown) {
      sendError(res, err);
    }
  }
}
